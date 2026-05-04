"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import { redirect } from "next/navigation";
import { notifyRedemptionFulfilled } from "@/lib/notifications/triggers/redemption-fulfilled";

export async function markFulfilledAction(redemptionId: string, fulfillmentNote: string) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("reward_redemptions")
    .update({
      status: "fulfilled",
      fulfillment_note: fulfillmentNote || null,
      fulfilled_at: new Date().toISOString(),
    })
    .eq("id", redemptionId)
    .eq("community_id", ctx.currentCommunityId || "");

  if (error) {
    return { error: error.message };
  }

  // Notify the fan. Best-effort; never block the action.
  try {
    const { data: redemption } = await supabase
      .from("reward_redemptions")
      .select("member_id, rewards(name, brand_slug)")
      .eq("id", redemptionId)
      .maybeSingle();
    if (redemption) {
      const reward = (redemption as { rewards?: { name?: string; brand_slug?: string } }).rewards;
      notifyRedemptionFulfilled({
        memberId: redemption.member_id as string,
        redemptionId,
        rewardName: reward?.name ?? "Your reward",
        brandSlug: reward?.brand_slug,
        fulfillmentNote: fulfillmentNote || undefined,
      }).catch(() => {});
    }
  } catch {
    /* no-op */
  }

  return { success: true };
}

export async function cancelRedemptionAction(
  redemptionId: string,
  memberId: string,
  pointCost: number
) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");

  const supabase = createAdminClient();

  // Get the redemption to verify community
  const { data: redemption, error: fetchError } = await supabase
    .from("reward_redemptions")
    .select("*")
    .eq("id", redemptionId)
    .maybeSingle();

  if (fetchError || !redemption) {
    return { error: "Redemption not found" };
  }

  if (redemption.community_id !== ctx.currentCommunityId && !ctx.isSuperAdmin) {
    return { error: "Unauthorized" };
  }

  // Update status
  const { error: updateError } = await supabase
    .from("reward_redemptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", redemptionId);

  if (updateError) {
    return { error: updateError.message };
  }

  // Refund points: read current, then update (no race concern — refunds are
  // admin-triggered and low-volume).
  const { data: currentMember } = await supabase
    .from("members")
    .select("total_points")
    .eq("id", memberId)
    .maybeSingle();
  const currentPoints = (currentMember?.total_points as number | null) ?? 0;
  await supabase
    .from("members")
    .update({ total_points: currentPoints + pointCost })
    .eq("id", memberId);

  // Ledger entry for audit trail.
  await supabase.from("points_ledger").insert([
    {
      member_id: memberId,
      delta: pointCost,
      source: "reward_redemption",
      source_ref: `redemption:${redemptionId}:refund`,
      note: "Refunded: redemption cancelled",
    },
  ]);

  return { success: true };
}
