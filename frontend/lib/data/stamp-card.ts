// Relative, extension-full import (like lib/streaks/touch.ts) so the pure
// helpers below can be unit-tested under plain `node --test` without the
// "@/" alias. admin.ts depends only on @supabase/supabase-js.
import { createAdminClient } from "../supabase/admin.ts";

export type StampCardData = {
  stampsRequired: number;
  rewardTitle: string;
  rewardDescription: string | null;
  stampsEarned: number;
  completedRounds: number;
  stampsInCurrentRound: number;
  /** Visits still needed to finish the current round (0 right after completing one). */
  visitsRemaining: number;
  /** True when the latest check-in filled the card (a fresh round starts next visit). */
  justCompleted: boolean;
};

export type StampCardProgress = Pick<
  StampCardData,
  "completedRounds" | "stampsInCurrentRound" | "visitsRemaining" | "justCompleted"
>;

/**
 * Pure stamp-card arithmetic: where `totalCheckins` visits land on a card of
 * `stampsRequired` stamps. A non-positive `stampsRequired` is treated as 1
 * so the maths never divides by zero.
 */
export function stampCardProgress(
  totalCheckins: number,
  stampsRequired: number,
): StampCardProgress {
  const required = Math.max(1, Math.floor(stampsRequired) || 1);
  const total = Math.max(0, Math.floor(totalCheckins) || 0);
  const completedRounds = Math.floor(total / required);
  const stampsInCurrentRound = total % required;
  const justCompleted = total > 0 && stampsInCurrentRound === 0;
  return {
    completedRounds,
    stampsInCurrentRound,
    visitsRemaining: justCompleted ? 0 : required - stampsInCurrentRound,
    justCompleted,
  };
}

/**
 * Fetch stamp card config + member's progress for a brand.
 * Returns null if no active stamp card is configured for this brand.
 */
export async function getStampCardData(
  brandSlug: string,
  memberId: string,
): Promise<StampCardData | null> {
  const admin = createAdminClient();

  const [configRes, countRes] = await Promise.all([
    admin
      .from("stamp_card_configs")
      .select("stamps_required, reward_title, reward_description")
      .eq("brand_slug", brandSlug)
      .eq("active", true)
      .maybeSingle(),

    admin
      .from("checkins")
      .select("*", { count: "exact", head: true })
      .eq("member_id", memberId)
      .eq("brand_slug", brandSlug),
  ]);

  if (!configRes.data) return null;

  const config = configRes.data;
  const totalCheckins = countRes.count ?? 0;
  const stampsRequired = config.stamps_required as number;

  return {
    stampsRequired,
    rewardTitle: config.reward_title as string,
    rewardDescription: config.reward_description as string | null,
    stampsEarned: totalCheckins,
    ...stampCardProgress(totalCheckins, stampsRequired),
  };
}
