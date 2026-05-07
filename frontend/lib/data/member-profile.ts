import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public member profile data layer.
 *
 * Returns ONLY public-safe fields — never email, phone, stripe ids,
 * last login, moderation flags, or anything else that could be used
 * for harassment, account discovery, or impersonation. The list of
 * what's safe is intentionally short:
 *
 *   - handle (the URL slug — public by definition)
 *   - first name (no last name unless they explicitly add one later)
 *   - avatar
 *   - tier
 *   - total points
 *   - member-since date
 *   - founder badges with founder number + community
 *   - regular badges with award date
 *   - brands they follow
 *
 * If public_profile_enabled is false the function returns null and the
 * route should 404 — opt-out support without leaking that the handle
 * exists.
 */

export interface PublicFounderBadge {
  communitySlug: string;
  communityName: string;
  accentFrom: string;
  accentTo: string;
  founderNumber: number;
}

export interface PublicBadge {
  slug: string;
  name: string;
  description: string | null;
  earnedAt: string;
}

export interface PublicBrand {
  slug: string;
  name: string;
}

export interface PublicMemberProfile {
  handle: string;
  firstName: string | null;
  avatarUrl: string | null;
  tier: string;
  totalPoints: number;
  memberSince: string;
  founderBadges: PublicFounderBadge[];
  badges: PublicBadge[];
  brands: PublicBrand[];
}

export async function getMemberProfileByHandle(
  handle: string,
): Promise<PublicMemberProfile | null> {
  const admin = createAdminClient();
  const normalized = handle.toLowerCase();

  // 1. Resolve handle → member. ilike covers case variation; the unique
  //    index added in 0032 is already lower(handle) so this is fast.
  const { data: member, error: memberError } = await admin
    .from("members")
    .select(
      "id, handle, first_name, avatar_url, current_tier, total_points, created_at, public_profile_enabled",
    )
    .ilike("handle", normalized)
    .maybeSingle();

  if (memberError || !member) return null;
  // Opt-out: treat as 404 from the caller's perspective.
  if (member.public_profile_enabled === false) return null;

  // Run the three follow-up queries in parallel.
  // Note BEP schema differences from FE:
  //   - member_community_memberships.community_id references communities.slug (text)
  //   - member_brand_following keys on brand_slug (text), joins brands directly
  //   - member_badges joins badges via badge_slug
  const [founderRes, badgesRes, followingRes] = await Promise.all([
    admin
      .from("member_community_memberships")
      .select(
        "community_id, founder_number, communities!inner ( slug, display_name, accent_from, accent_to )",
      )
      .eq("member_id", member.id)
      .eq("is_founder", true)
      .order("founder_number", { ascending: true }),
    admin
      .from("member_badges")
      .select("earned_at, badges!inner ( slug, name, description )")
      .eq("member_id", member.id)
      .order("earned_at", { ascending: false }),
    admin
      .from("member_brand_following")
      .select("brands!inner ( slug, name )")
      .eq("member_id", member.id),
  ]);

  // Supabase's typed select inference for nested !inner joins can be
  // wonky depending on table relations metadata; we narrow with an
  // explicit cast so the rest of the function stays clean.
  type FounderRow = {
    community_id: string;
    founder_number: number;
    communities: {
      slug: string;
      display_name: string;
      accent_from: string;
      accent_to: string;
    };
  };
  type BadgeRow = {
    earned_at: string;
    badges: { slug: string; name: string; description: string | null };
  };
  type FollowRow = {
    brands: { slug: string; name: string };
  };

  const founders = (founderRes.data ?? []) as unknown as FounderRow[];
  const badges = (badgesRes.data ?? []) as unknown as BadgeRow[];
  const following = (followingRes.data ?? []) as unknown as FollowRow[];

  return {
    handle: member.handle,
    firstName: member.first_name as string | null,
    avatarUrl: member.avatar_url as string | null,
    tier: (member.current_tier as string | null) ?? "bronze",
    totalPoints: (member.total_points as number | null) ?? 0,
    memberSince: member.created_at as string,
    founderBadges: founders.map((m) => ({
      communitySlug: m.communities.slug,
      communityName: m.communities.display_name,
      accentFrom: m.communities.accent_from ?? "#7c3aed",
      accentTo: m.communities.accent_to ?? "#fb923c",
      founderNumber: m.founder_number,
    })),
    badges: badges.map((b) => ({
      slug: b.badges.slug,
      name: b.badges.name,
      description: b.badges.description,
      earnedAt: b.earned_at,
    })),
    brands: following.map((f) => ({
      slug: f.brands.slug,
      name: f.brands.name,
    })),
  };
}

/**
 * Lookup helper for the user menu. Given a member id, return their
 * current handle so the dropdown can link to /members/<handle>. Cheap
 * single-row lookup; falls back to null if the member isn't in the
 * members table yet (e.g. mid-signup race).
 */
export async function getMemberHandle(
  memberId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("members")
    .select("handle")
    .eq("id", memberId)
    .maybeSingle();
  return (data?.handle as string | null) ?? null;
}
