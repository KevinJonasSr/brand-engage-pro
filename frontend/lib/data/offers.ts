import { createClient } from "@/lib/supabase/server";
import { getCurrentCommunityId } from "@/lib/community";
import type { Offer } from "./types";

/**
 * Active offers for the current brand/community only.
 *
 * Soft-launch: scoped via `x-community-id` (defaults to Nellie's) so the
 * marketplace never mixes in Fan Engage / artist leftover catalog rows from
 * other communities (e.g. jonas-group-ent music offers).
 */
export async function getActiveOffers(): Promise<Offer[]> {
  try {
    const supabase = await createClient();
    const communityId = await getCurrentCommunityId();
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
    return (data ?? []) as Offer[];
  } catch {
    return [];
  }
}

export async function getFeaturedOffers(limit = 3): Promise<Offer[]> {
  const offers = await getActiveOffers();
  return offers.slice(0, limit);
}
