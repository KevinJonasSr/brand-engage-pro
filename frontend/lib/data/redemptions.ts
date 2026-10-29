import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessBrand, type AdminScopeContext } from "@/lib/admin-scope";
import {
  isValidShortCode,
  normalizeShortCode,
  perkTitle,
  type WalletItem,
  type WalletStatus,
} from "@/lib/redemption-code";
import type { TierSlug } from "./types";

/**
 * Redemption wallet + staff lookup (Sprint 2, track B).
 *
 * Reads use the service-role client, always filtered by the signed-in
 * member's id (wallet) or the admin's brand scope (lookup). Reason: RLS
 * lets a member read their own reward_redemptions and member_perks rows
 * (0021 redemptions_member_read, 0058 member_perks_self_select), but
 * rewards_catalog is public-read only for `active = true` rows, so a
 * redemption of a since-retired reward would lose its name under the
 * user's own client. Brand names (brands table) have the same problem for
 * inactive brands. Callers must pass the id from supabase.auth.getUser(),
 * never from the request.
 */

interface RedemptionRow {
  id: string;
  member_id: string;
  reward_id: string;
  community_id: string | null;
  point_cost: number;
  status: "pending" | "fulfilled" | "cancelled";
  delivery_details: string | null;
  fulfillment_note: string | null;
  created_at: string;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  short_code: string | null;
  reward: { title?: string | null } | Array<{ title?: string | null }> | null;
}

interface PerkRow {
  id: string;
  member_id: string;
  community_id: string;
  perk_slug: string;
  granted_at: string;
  redeemed_at: string | null;
  short_code: string | null;
}

const REDEMPTION_SELECT = `
  id, member_id, reward_id, community_id, point_cost, status,
  delivery_details, fulfillment_note, created_at, fulfilled_at, cancelled_at,
  short_code,
  reward:rewards_catalog(title)
`;

const PERK_SELECT =
  "id, member_id, community_id, perk_slug, granted_at, redeemed_at, short_code";

function rewardTitle(row: RedemptionRow): string {
  const r = Array.isArray(row.reward) ? row.reward[0] : row.reward;
  return (r?.title ?? "").trim() || "Reward";
}

function redemptionStatus(row: RedemptionRow): WalletStatus {
  return row.status;
}

/** Brand display names keyed by slug; falls back to the slug. */
export async function brandNamesFor(slugs: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const wanted = [...new Set([...slugs].filter((s): s is string => !!s))];
  const names = new Map<string, string>();
  if (wanted.length === 0) return names;
  try {
    const admin = createAdminClient();
    const [{ data: brands }, { data: communities }] = await Promise.all([
      admin.from("brands").select("slug, name").in("slug", wanted),
      admin.from("communities").select("slug, display_name").in("slug", wanted),
    ]);
    for (const c of (communities ?? []) as Array<{ slug: string; display_name: string | null }>) {
      if (c.display_name) names.set(c.slug, c.display_name);
    }
    // brands.name wins: it is what the member-facing pages already show.
    for (const b of (brands ?? []) as Array<{ slug: string; name: string | null }>) {
      if (b.name) names.set(b.slug, b.name);
    }
  } catch (err) {
    console.warn("brandNamesFor: failed", err instanceof Error ? err.message : err);
  }
  for (const s of wanted) if (!names.has(s)) names.set(s, s);
  return names;
}

function toRedemptionItem(row: RedemptionRow, brandName: string): WalletItem {
  return {
    kind: "redemption",
    id: row.id,
    code: row.short_code ?? null,
    brandSlug: row.community_id,
    brandName,
    title: rewardTitle(row),
    status: redemptionStatus(row),
    createdAt: row.created_at,
    resolvedAt: row.fulfilled_at ?? row.cancelled_at ?? null,
    note: row.fulfillment_note ?? row.delivery_details ?? null,
  };
}

function toPerkItem(row: PerkRow, brandName: string): WalletItem {
  return {
    kind: "perk",
    id: row.id,
    code: row.short_code ?? null,
    brandSlug: row.community_id,
    brandName,
    title: perkTitle(row.perk_slug),
    status: row.redeemed_at ? "used" : "unused",
    createdAt: row.granted_at,
    resolvedAt: row.redeemed_at,
    note: null,
  };
}

/**
 * Every redemption and perk for one member, unsorted. Pass the id from the
 * session. Returns [] when either table is unreachable (e.g. 0084 not yet
 * applied, in which case the short_code column read fails and we retry
 * without it so the wallet still renders).
 */
export async function listMemberWallet(memberId: string): Promise<WalletItem[]> {
  if (!memberId) return [];
  try {
    const admin = createAdminClient();
    const [redemptionsRes, perksRes] = await Promise.all([
      admin
        .from("reward_redemptions")
        .select(REDEMPTION_SELECT)
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("member_perks")
        .select(PERK_SELECT)
        .eq("member_id", memberId)
        .order("granted_at", { ascending: false })
        .limit(100),
    ]);

    let redemptions = (redemptionsRes.data ?? []) as unknown as RedemptionRow[];
    let perks = (perksRes.data ?? []) as unknown as PerkRow[];

    if (redemptionsRes.error) {
      console.warn("listMemberWallet: redemptions", redemptionsRes.error.message);
      // Pre-0084 fallback: same query without short_code.
      const retry = await admin
        .from("reward_redemptions")
        .select(REDEMPTION_SELECT.replace("short_code,", ""))
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(100);
      redemptions = ((retry.data ?? []) as unknown as RedemptionRow[]).map((r) => ({
        ...r,
        short_code: null,
      }));
    }
    if (perksRes.error) {
      console.warn("listMemberWallet: perks", perksRes.error.message);
      const retry = await admin
        .from("member_perks")
        .select(PERK_SELECT.replace(", short_code", ""))
        .eq("member_id", memberId)
        .order("granted_at", { ascending: false })
        .limit(100);
      perks = ((retry.data ?? []) as unknown as PerkRow[]).map((p) => ({ ...p, short_code: null }));
    }

    const names = await brandNamesFor([
      ...redemptions.map((r) => r.community_id),
      ...perks.map((p) => p.community_id),
    ]);
    const name = (slug: string | null) => (slug ? names.get(slug) ?? slug : "Brand Engage Pro");

    return [
      ...redemptions.map((r) => toRedemptionItem(r, name(r.community_id))),
      ...perks.map((p) => toPerkItem(p, name(p.community_id))),
    ];
  } catch (err) {
    console.warn("listMemberWallet: failed", err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── Member card ───────────────────────────────────────────────────────────

export interface CardMembership {
  communityId: string;
  brandName: string;
  currentTier: TierSlug;
  /** Lifetime points earned at this brand (memberships.lifetime_points). */
  brandLifetimePoints: number;
  isFounder: boolean;
  joinedAt: string;
}

/**
 * Active memberships for the card, one per ACTIVE brand, oldest join first.
 * Memberships of retired brand slugs (brands.active = false) are skipped so
 * the card never shows a tab for a brand the member cannot visit.
 */
export async function listCardMemberships(memberId: string): Promise<CardMembership[]> {
  if (!memberId) return [];
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("member_community_memberships")
      .select("community_id, current_tier, lifetime_points, is_founder, joined_at, status")
      .eq("member_id", memberId)
      .order("joined_at", { ascending: true });
    if (error) {
      console.warn("listCardMemberships: supabase error", error.message);
      return [];
    }
    const allRows = ((data ?? []) as Array<{
      community_id: string;
      current_tier: TierSlug | null;
      lifetime_points: number | null;
      is_founder: boolean | null;
      joined_at: string;
      status: string | null;
    }>).filter((r) => (r.status ?? "active") === "active");
    const { data: activeBrands } = await admin
      .from("brands")
      .select("slug")
      .eq("active", true)
      .in("slug", allRows.map((r) => r.community_id));
    const activeSlugs = new Set(
      ((activeBrands ?? []) as Array<{ slug: string }>).map((b) => b.slug),
    );
    const rows = allRows.filter((r) => activeSlugs.has(r.community_id));
    const names = await brandNamesFor(rows.map((r) => r.community_id));
    return rows.map((r) => ({
      communityId: r.community_id,
      brandName: names.get(r.community_id) ?? r.community_id,
      currentTier: r.current_tier ?? "bronze",
      brandLifetimePoints: Math.max(0, r.lifetime_points ?? 0),
      isFounder: !!r.is_founder,
      joinedAt: r.joined_at,
    }));
  } catch (err) {
    console.warn("listCardMemberships: failed", err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── Staff lookup ──────────────────────────────────────────────────────────

export interface WalletLookup {
  item: WalletItem;
  member: {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
  };
  /** Redemption only. */
  pointCost: number | null;
  deliveryDetails: string | null;
  fulfillmentNote: string | null;
}

/**
 * Find a redemption or perk by short code inside the admin's brand scope.
 * Returns null for an invalid code, no match, or a match the admin may not
 * see (so a brand admin cannot probe other brands' codes).
 */
export async function findWalletItemByCode(
  rawCode: string,
  ctx: AdminScopeContext,
): Promise<WalletLookup | null> {
  const code = normalizeShortCode(rawCode);
  if (!isValidShortCode(code)) return null;

  try {
    const admin = createAdminClient();
    const [redemptionRes, perkRes] = await Promise.all([
      admin.from("reward_redemptions").select(REDEMPTION_SELECT).eq("short_code", code).maybeSingle(),
      admin.from("member_perks").select(PERK_SELECT).eq("short_code", code).maybeSingle(),
    ]);
    if (redemptionRes.error) {
      console.warn("findWalletItemByCode: redemptions", redemptionRes.error.message);
    }
    if (perkRes.error) {
      console.warn("findWalletItemByCode: perks", perkRes.error.message);
    }

    const redemption = (redemptionRes.data ?? null) as unknown as RedemptionRow | null;
    const perk = (perkRes.data ?? null) as unknown as PerkRow | null;

    let item: WalletItem | null = null;
    let memberId: string | null = null;
    let brandSlug: string | null = null;

    if (redemption) {
      brandSlug = redemption.community_id;
      if (!canAccessBrand(ctx, brandSlug)) return null;
      memberId = redemption.member_id;
      const names = await brandNamesFor([brandSlug]);
      item = toRedemptionItem(redemption, brandSlug ? names.get(brandSlug) ?? brandSlug : "Brand Engage Pro");
    } else if (perk) {
      brandSlug = perk.community_id;
      if (!canAccessBrand(ctx, brandSlug)) return null;
      memberId = perk.member_id;
      const names = await brandNamesFor([brandSlug]);
      item = toPerkItem(perk, names.get(brandSlug) ?? brandSlug);
    }
    if (!item || !memberId) return null;

    const { data: m } = await admin
      .from("members")
      .select("id, first_name, last_name, email, avatar_url")
      .eq("id", memberId)
      .maybeSingle();
    const first = (m?.first_name as string | null) ?? "";
    const last = (m?.last_name as string | null) ?? "";
    const name = `${first} ${last}`.trim() || "Member";

    return {
      item,
      member: {
        id: memberId,
        name,
        email: (m?.email as string | null) ?? null,
        avatarUrl: (m?.avatar_url as string | null) ?? null,
      },
      pointCost: redemption ? redemption.point_cost : null,
      deliveryDetails: redemption?.delivery_details ?? null,
      fulfillmentNote: redemption?.fulfillment_note ?? null,
    };
  } catch (err) {
    console.warn("findWalletItemByCode: failed", err instanceof Error ? err.message : err);
    return null;
  }
}
