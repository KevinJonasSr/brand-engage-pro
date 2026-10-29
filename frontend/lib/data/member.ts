import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentCommunityId } from "@/lib/community";
import type { MemberKpis, MemberProfile, Tier, TierSlug } from "./types";
import { getTiers } from "./tiers";
import {
  sumLedgerDeltas,
  sumPositiveLedgerDeltas,
  tierProgress,
} from "./member-points";

/**
 * Per-community membership row — the authoritative source of a member's
 * points, tier, and referral code within a single community. Replaces
 * direct reads of `members.total_points` / `members.current_tier` in any
 * code path that's scoped to a specific community.
 */
export interface MemberMembership {
  member_id: string;
  community_id: string;
  joined_at: string;
  total_points: number;
  current_tier: TierSlug;
  referral_code: string | null;
  status: "active" | "suspended" | "pending";
}

/**
 * Fetch the signed-in member's membership for the current community (or a
 * specific community_id if provided). Returns null for signed-out users,
 * members without a membership in the community, or any DB error.
 */
export async function getCurrentMembership(
  communityId?: string,
): Promise<MemberMembership | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const community = communityId ?? (await getCurrentCommunityId());

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("member_community_memberships")
      .select("*")
      .eq("member_id", user.id)
      .eq("community_id", community)
      .maybeSingle();

    if (error) {
      console.warn("getCurrentMembership: supabase error", error.message);
      return null;
    }
    return (data as MemberMembership | null) ?? null;
  } catch (err) {
    console.warn("getCurrentMembership: failed", err);
    return null;
  }
}

export interface PointBreakdownRow {
  source: string;
  label: string;
  total: number;
}

// Human-readable label per point source. Matches the enum in 0001_init.sql.
const SOURCE_LABELS: Record<string, string> = {
  signup_bonus: "Signup bonus",
  referral: "Referrals",
  challenge: "Challenges",
  purchase: "Purchases",
  manual_adjustment: "Adjustments",
  event_rsvp: "Event RSVPs",
  event_attended: "Events attended",
  social_share: "Social shares",
  daily_checkin: "Daily check-ins",
};

/**
 * Spendable / available points: SUM(points_ledger.delta) for this member.
 * Admin read so RLS cannot hide adjustment rows. Returns 0 when signed out
 * or the query fails.
 */
export async function getSpendablePoints(memberId?: string): Promise<number> {
  try {
    let id = memberId;
    if (!id) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return 0;
      id = user.id;
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("points_ledger")
      .select("delta")
      .eq("member_id", id);
    if (error) {
      console.warn("getSpendablePoints: supabase error", error.message);
      return 0;
    }
    return sumLedgerDeltas(data ?? []);
  } catch (err) {
    console.warn("getSpendablePoints: failed", err);
    return 0;
  }
}

/**
 * Lifetime points earned: SUM(points_ledger.delta) WHERE delta > 0, floored
 * at members.lifetime_points (migration 0082 backfills that column from the
 * ledger and from grants that predate the ledger, so it can only be higher).
 * Tier progress reads this, not the spendable balance: redeeming a reward
 * never moves a member back toward a lower tier. Returns 0 when signed out
 * or every read fails.
 */
export async function getLifetimePoints(memberId?: string): Promise<number> {
  try {
    let id = memberId;
    if (!id) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return 0;
      id = user.id;
    }

    const admin = createAdminClient();
    const [ledgerRes, memberRes] = await Promise.all([
      admin.from("points_ledger").select("delta").eq("member_id", id).gt("delta", 0),
      // Missing column (0082 not applied yet) is an error here, not a crash.
      admin.from("members").select("lifetime_points").eq("id", id).maybeSingle(),
    ]);
    if (ledgerRes.error) {
      console.warn("getLifetimePoints: supabase error", ledgerRes.error.message);
    }
    const fromLedger = sumPositiveLedgerDeltas(ledgerRes.data ?? []);
    const column = memberRes.error
      ? 0
      : Number((memberRes.data as { lifetime_points?: number | null } | null)?.lifetime_points ?? 0);
    return Math.max(fromLedger, Number.isFinite(column) ? column : 0);
  } catch (err) {
    console.warn("getLifetimePoints: failed", err);
    return 0;
  }
}

/**
 * Sum of points the current member has earned, grouped by source. Returns an
 * empty array for signed-out users or when the member has no ledger entries.
 */
export async function getPointBreakdown(): Promise<PointBreakdownRow[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("points_ledger")
      .select("source,delta")
      .eq("member_id", user.id);
    if (error) throw error;

    const totals = new Map<string, number>();
    for (const row of data ?? []) {
      const source = row.source as string;
      totals.set(source, (totals.get(source) ?? 0) + (row.delta as number));
    }

    return [...totals.entries()]
      .filter(([, total]) => total !== 0)
      .map(([source, total]) => ({
        source,
        label: SOURCE_LABELS[source] ?? source,
        total,
      }))
      .sort((a, b) => b.total - a.total);
  } catch {
    return [];
  }
}

/**
 * Fetches the current user's member profile. Returns null for signed-out or
 * unconfigured-Supabase — callers should fall back to static preview content.
 */
export async function getCurrentMember(): Promise<MemberProfile | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.warn("getCurrentMember: supabase error", error.message);
      return null;
    }

    return data as MemberProfile | null;
  } catch (err) {
    console.warn("getCurrentMember: failed", err);
    return null;
  }
}

/**
 * Rolls up the member's headline KPIs: spendable points from the ledger
 * (not membership.total_points / members.total_points — those drift),
 * community-scoped referrals and badges, distance to next tier.
 *
 * Wallet figures (`total_points` / `spendable_points`) are the net ledger
 * balance. Tier progress (`next_tier` / `points_to_next_tier`) is computed
 * from `lifetime_points` so spending never demotes (migration 0082).
 */
export async function getCurrentMemberKpis(): Promise<MemberKpis | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const communityId = await getCurrentCommunityId();

    const [total_points, lifetime_points, referralsRes, badgesRes, tiers] = await Promise.all([
      getSpendablePoints(user.id),
      getLifetimePoints(user.id),
      supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", user.id)
        .eq("community_id", communityId),
      supabase
        .from("member_badges")
        .select("badge_slug", { count: "exact", head: true })
        .eq("member_id", user.id)
        .eq("community_id", communityId),
      getTiers(),
    ]);
    const referral_count = referralsRes.count ?? 0;
    const badge_count = badgesRes.count ?? 0;

    // Lifetime can never be below the spendable balance; guard against a
    // ledger with only net rows (e.g. a manual adjustment that nets out).
    const lifetime = Math.max(lifetime_points, total_points);
    const { next_tier, points_to_next_tier } = tierProgress(tiers, lifetime);

    return {
      total_points,
      spendable_points: total_points,
      lifetime_points: lifetime,
      referral_count,
      badge_count,
      next_tier: (next_tier ?? null) as Tier | null,
      points_to_next_tier,
    };
  } catch (err) {
    console.warn("getCurrentMemberKpis: failed", err);
    return null;
  }
}
