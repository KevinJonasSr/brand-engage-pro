import { createSuperFanRadarClient } from "./client";

export type SuperFanTier = "NONE" | "CANDIDATE" | "CORE" | "ELITE";

export type TopSuperFan = {
  username: string;
  platform: string;
  tier: SuperFanTier;
  index: number;
  outreach_opt_in: boolean;
};

export type SuperFanRadarSummary =
  | { connected: false }
  | {
      connected: true;
      tenantSlug: string;
      counts: { elite: number; core: number; candidate: number };
      inviteReadyCount: number;
      topFans: TopSuperFan[];
    };

/**
 * Read-only summary of a brand's Super Fan Radar data, sourced from the
 * separate Fan Analytics Dashboard Supabase project. Matches by
 * tenants.type = 'BRAND' AND tenants.slug = brandSlug — brand_profile_id is
 * an integer FK into that project's own brand_profiles table and is NOT
 * usable for cross-project matching, so it is ignored entirely.
 *
 * Returns { connected: false } if no tenant row exists yet for this brand —
 * that's an expected, common state (brand hasn't been connected to Super
 * Fan Radar), not an error.
 */
export async function getSuperFanRadarSummary(
  brandSlug: string,
): Promise<SuperFanRadarSummary> {
  const client = createSuperFanRadarClient();

  const { data: tenant } = await client
    .from("tenants")
    .select("id, slug")
    .eq("type", "BRAND")
    .eq("slug", brandSlug)
    .maybeSingle();

  if (!tenant) {
    return { connected: false };
  }

  const { data: fans } = await client
    .from("fans")
    .select("username, platform, super_fan_tier, super_fan_index, outreach_opt_in")
    .eq("tenant_id", tenant.id)
    .order("super_fan_index", { ascending: false });

  const rows = (fans ?? []) as Array<{
    username: string;
    platform: string;
    super_fan_tier: SuperFanTier;
    super_fan_index: number;
    outreach_opt_in: boolean;
  }>;

  const counts = { elite: 0, core: 0, candidate: 0 };
  let inviteReadyCount = 0;
  for (const f of rows) {
    if (f.super_fan_tier === "ELITE") counts.elite++;
    else if (f.super_fan_tier === "CORE") counts.core++;
    else if (f.super_fan_tier === "CANDIDATE") counts.candidate++;
    if (f.outreach_opt_in) inviteReadyCount++;
  }

  const topFans: TopSuperFan[] = rows.slice(0, 10).map((f) => ({
    username: f.username,
    platform: f.platform,
    tier: f.super_fan_tier,
    index: f.super_fan_index,
    outreach_opt_in: f.outreach_opt_in,
  }));

  return {
    connected: true,
    tenantSlug: tenant.slug,
    counts,
    inviteReadyCount,
    topFans,
  };
}
