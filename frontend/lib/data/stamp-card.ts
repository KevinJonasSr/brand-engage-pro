import { createAdminClient } from "@/lib/supabase/admin";

export type StampCardData = {
  stampsRequired: number;
  rewardTitle: string;
  rewardDescription: string | null;
  stampsEarned: number;
  completedRounds: number;
  stampsInCurrentRound: number;
};

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
  const completedRounds = Math.floor(totalCheckins / stampsRequired);
  const stampsInCurrentRound = totalCheckins % stampsRequired;

  return {
    stampsRequired,
    rewardTitle: config.reward_title as string,
    rewardDescription: config.reward_description as string | null,
    stampsEarned: totalCheckins,
    completedRounds,
    stampsInCurrentRound,
  };
}
