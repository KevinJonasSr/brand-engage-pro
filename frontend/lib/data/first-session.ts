import { createClient } from "@/lib/supabase/server";
import type { FirstSessionFacts } from "@/lib/first-session";
import { EMPTY_FIRST_SESSION_FACTS } from "@/lib/first-session";

/**
 * Live first-session progress for the signed-in member.
 * Head-count only — no marketing payloads or audience writes.
 * Returns null when signed out; empty facts on a query hiccup so home
 * can still render the checklist.
 */
export async function getFirstSessionFacts(): Promise<FirstSessionFacts | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const [
      memberRes,
      followsRes,
      membershipsRes,
      checkinsRes,
      redemptionsRes,
      referralsRes,
    ] = await Promise.all([
      supabase.from("members").select("first_name").eq("id", user.id).maybeSingle(),
      supabase
        .from("member_brand_following")
        .select("brand_slug", { count: "exact", head: true })
        .eq("member_id", user.id),
      supabase
        .from("member_community_memberships")
        .select("community_id", { count: "exact", head: true })
        .eq("member_id", user.id),
      supabase
        .from("checkins")
        .select("id", { count: "exact", head: true })
        .eq("member_id", user.id),
      supabase
        .from("reward_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("member_id", user.id),
      supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", user.id),
    ]);

    return {
      hasProfile: Boolean((memberRes.data?.first_name as string | null)?.trim()),
      hasJoinedBrand:
        (followsRes.count ?? 0) > 0 || (membershipsRes.count ?? 0) > 0,
      hasCheckinOrRedeem:
        (checkinsRes.count ?? 0) > 0 || (redemptionsRes.count ?? 0) > 0,
      hasInvite: (referralsRes.count ?? 0) > 0,
    };
  } catch {
    return EMPTY_FIRST_SESSION_FACTS;
  }
}
