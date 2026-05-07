import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public member profile data layer.
 *
 * Returns ONLY public-safe fields — never email, phone, stripe ids,
 * last login, moderation flags, or anything else that could be used
 * for harassment, account discovery, or impersonation.
 *
 * Schema notes (post 0033):
 *   - profile_slug    URL-safe slug used by /members/<slug>
 *   - socials (jsonb) social handles, e.g. {"instagram_or_tiktok": "@x"}
 *   - handle (legacy) deprecated; null for new rows after 0033 trigger
 *
 * If public_profile_enabled is false the function returns null and
 * the route 404s — opt-out without leaking that the slug exists.
 */

export interface MemberSocials {
  instagram_or_tiktok?: string | null;
  // future: instagram, tiktok, twitter, threads, youtube, etc.
}

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
  profileSlug: string;
  firstName: string | null;
  avatarUrl: string | null;
  tier: string;
  totalPoints: number;
  memberSince: string;
  socials: MemberSocials;
  founderBadges: PublicFounderBadge[];
  badges: PublicBadge[];
  brands: PublicBrand[];
}

export async function getMemberProfileBySlug(
  slug: string,
): Promise<PublicMemberProfile | null> {
  const admin = createAdminClient();
  const normalized = slug.toLowerCase();

  const { data: member, error: memberError } = await admin
    .from("members")
    .select(
      "id, profile_slug, first_name, avatar_url, current_tier, total_points, created_at, public_profile_enabled, socials",
    )
    .ilike("profile_slug", normalized)
    .maybeSingle();

  if (memberError || !member) return null;
  if (member.public_profile_enabled === false) return null;

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
  type FollowRow = { brands: { slug: string; name: string } };

  const founders = (founderRes.data ?? []) as unknown as FounderRow[];
  const badges = (badgesRes.data ?? []) as unknown as BadgeRow[];
  const following = (followingRes.data ?? []) as unknown as FollowRow[];

  return {
    profileSlug: member.profile_slug as string,
    firstName: member.first_name as string | null,
    avatarUrl: member.avatar_url as string | null,
    tier: (member.current_tier as string | null) ?? "bronze",
    totalPoints: (member.total_points as number | null) ?? 0,
    memberSince: member.created_at as string,
    socials: ((member.socials as MemberSocials | null) ?? {}) as MemberSocials,
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
 * current profile_slug so the dropdown can link to /members/<slug>.
 */
export async function getMemberProfileSlug(
  memberId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("members")
    .select("profile_slug")
    .eq("id", memberId)
    .maybeSingle();
  return (data?.profile_slug as string | null) ?? null;
}
