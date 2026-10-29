import { createClient } from "@/lib/supabase/server";
import { getCurrentCommunityIdOrNull } from "@/lib/community";
import { applyNelliesLaunchOffers } from "@/lib/nellies-launch";
import type { Offer } from "./types";

/**
 * Active offers for the current brand/community only.
 *
 * Scoped via `x-community-id` (or the first active brand) so the
 * marketplace never mixes in Fan Engage / artist leftover catalog rows from
 * other communities (e.g. jonas-group-ent music offers).
 */
export async function getActiveOffers(): Promise<Offer[]> {
  // Resolve the community once, outside the query try/catch. When nothing
  // resolves (no header, no active brand) there is no community to scope
  // to, so there are no offers — never silently fall back to Nellie's.
  const communityId = await getCurrentCommunityIdOrNull().catch(() => null);
  if (!communityId) return [];
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("offers")
      .select("*")
      .eq("active", true)
      .eq("community_id", communityId)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return applyNelliesLaunchOffers(
      communityId,
      (data ?? []) as Offer[],
    ) as Offer[];
  } catch {
    return applyNelliesLaunchOffers(communityId, []) as Offer[];
  }
}

export async function getFeaturedOffers(limit = 3): Promise<Offer[]> {
  const offers = await getActiveOffers();
  return offers.slice(0, limit);
}
