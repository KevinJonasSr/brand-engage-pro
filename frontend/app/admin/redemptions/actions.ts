"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessBrand, getAdminContext, requireWritableBrand } from "@/lib/admin";
import { redirect } from "next/navigation";
import { cancelRedemption } from "@/lib/rewards/cancel";
import { markRedemptionFulfilled } from "@/lib/rewards/fulfill";
import { notifyRedemptionFulfilled } from "@/lib/notifications/triggers/redemption-fulfilled";

export async function markFulfilledAction(redemptionId: string, fulfillmentNote: string) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");

  // Super admins may fulfill in any brand; everyone else only in their own.
  const scope = ctx.isSuperAdmin ? null : ctx.currentCommunityId;
  if (!ctx.isSuperAdmin && !scope) {
    return { error: "Unauthorized" };
  }
  await requireWritableBrand(ctx, scope);

  const supabase = createAdminClient();
  const result = await markRedemptionFulfilled(supabase, redemptionId, fulfillmentNote, scope);
  if (result.error) {
    return { error: result.error };
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

export async function cancelRedemptionAction(redemptionId: string) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");

  // Super admins may cancel in any brand; everyone else only in their own.
  const scope = ctx.isSuperAdmin ? null : ctx.currentCommunityId;
  if (!ctx.isSuperAdmin && !scope) {
    return { error: "Unauthorized" };
  }
  await requireWritableBrand(ctx, scope);

  return cancelRedemption(createAdminClient(), redemptionId, scope);
}

/**
 * Mark a member perk (member_perks row: welcome dessert, birthday entrée…)
 * as used at the counter. Added for /admin/redemptions/[code]; perks have
 * no point refund so there is no cancel counterpart.
 */
export async function markPerkUsedAction(perkId: string) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");

  const supabase = createAdminClient();
  const { data: perk, error } = await supabase
    .from("member_perks")
    .select("id, community_id, redeemed_at")
    .eq("id", perkId)
    .maybeSingle();
  if (error || !perk) {
    return { error: "Perk not found" };
  }
  const brand = perk.community_id as string;
  if (!canAccessBrand(ctx, brand)) {
    return { error: "Unauthorized" };
  }
  await requireWritableBrand(ctx, ctx.isSuperAdmin ? null : brand);

  if (perk.redeemed_at) {
    return { error: "This perk was already used" };
  }

  const { error: updateError } = await supabase
    .from("member_perks")
    .update({ redeemed_at: new Date().toISOString() })
    .eq("id", perkId)
    .is("redeemed_at", null);
  if (updateError) {
    return { error: updateError.message };
  }
  return { success: true };
}
