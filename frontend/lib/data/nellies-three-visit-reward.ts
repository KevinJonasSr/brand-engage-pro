import { createClient } from "@/lib/supabase/server";
import { NELLIES_THREE_VISIT_REWARD_ID } from "@/lib/nellies-launch";

/**
 * True only when Nellie's "1,500 Bonus Points" catalog row is active.
 *
 * Public read policy on rewards_catalog returns active rows only, so a
 * paused reward comes back as no row. A lookup error also counts as
 * paused: the brand page must not advertise the bonus when we cannot
 * see that it is on.
 */
export async function isNelliesThreeVisitRewardActive(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("rewards_catalog")
      .select("id")
      .eq("id", NELLIES_THREE_VISIT_REWARD_ID)
      .eq("active", true)
      .maybeSingle();
    return !error && data != null;
  } catch {
    return false;
  }
}
