import { createAdminClient } from "@/lib/supabase/admin";

export type ActivityPulse = {
  checkinsToday: number;
  rsvpsThisWeek: number;
  postsThisWeek: number;
  newFollowersThisWeek: number;
};

/**
 * Fetch anonymized recent activity for a brand page social-proof strip.
 * All counts — no PII exposed. Safe to render publicly.
 */
export async function getActivityPulse(brandSlug: string): Promise<ActivityPulse> {
  const admin = createAdminClient();

  const todayET = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [checkinsRes, rsvpsRes, postsRes, followsRes] = await Promise.allSettled([
    admin
      .from("checkins")
      .select("*", { count: "exact", head: true })
      .eq("brand_slug", brandSlug)
      .gte("created_at", `${todayET}T00:00:00-05:00`),

    admin
      .from("event_rsvps")
      .select("event_id, brand_events!inner(brand_slug)", { count: "exact", head: true })
      .eq("brand_events.brand_slug", brandSlug)
      .gte("created_at", weekAgo),

    admin
      .from("community_posts")
      .select("*", { count: "exact", head: true })
      .eq("brand_slug", brandSlug)
      .gte("created_at", weekAgo),

    admin
      .from("member_brand_following")
      .select("*", { count: "exact", head: true })
      .eq("brand_slug", brandSlug)
      .gte("created_at", weekAgo),
  ]);

  return {
    checkinsToday:
      checkinsRes.status === "fulfilled" ? (checkinsRes.value.count ?? 0) : 0,
    rsvpsThisWeek:
      rsvpsRes.status === "fulfilled" ? (rsvpsRes.value.count ?? 0) : 0,
    postsThisWeek:
      postsRes.status === "fulfilled" ? (postsRes.value.count ?? 0) : 0,
    newFollowersThisWeek:
      followsRes.status === "fulfilled" ? (followsRes.value.count ?? 0) : 0,
  };
}
