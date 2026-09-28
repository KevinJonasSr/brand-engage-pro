import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mark a pending redemption fulfilled, but only inside the caller's brand.
 *
 * Callers pass the admin client and, unless the caller is a super admin,
 * the community they are allowed to act on. The update is filtered on that
 * community and on status = 'pending', so an admin of one brand can never
 * fulfill another brand's redemption, and a cancelled one stays cancelled.
 * Zero rows updated comes back as an error instead of a silent success.
 */
export async function markRedemptionFulfilled(
  admin: SupabaseClient,
  redemptionId: string,
  fulfillmentNote: string,
  communityId: string | null,
): Promise<
  { success: true; memberId: string; error?: undefined } | { success?: undefined; error: string }
> {
  if (!redemptionId) return { error: "Missing redemption id" };

  let query = admin
    .from("reward_redemptions")
    .update({
      status: "fulfilled",
      fulfillment_note: fulfillmentNote || null,
      fulfilled_at: new Date().toISOString(),
    })
    .eq("id", redemptionId)
    .eq("status", "pending");
  if (communityId !== null) query = query.eq("community_id", communityId);

  const { data, error } = await query.select("member_id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Redemption not found or no longer pending" };
  return { success: true, memberId: data.member_id as string };
}
