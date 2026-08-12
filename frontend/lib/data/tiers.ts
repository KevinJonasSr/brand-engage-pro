import { createClient } from "@/lib/supabase/server";
import type { Tier, TierSlug } from "./types";

/** Points ladder fallback (restaurant loyalty — not music perks). */
const FALLBACK: Tier[] = [
  {
    slug: "bronze",
    display_name: "Bronze",
    min_points: 0,
    perks: ["Welcome badge", "Member home + brand follow"],
    sort_order: 1,
  },
  {
    slug: "silver",
    display_name: "Silver",
    min_points: 2500,
    perks: ["Recognized regular", "Priority on member specials when available"],
    sort_order: 2,
  },
  {
    slug: "gold",
    display_name: "Gold",
    min_points: 10000,
    perks: ["Top of the visit ladder", "Aligns with Premium club gating (≈ Gold+)"],
    sort_order: 3,
  },
  {
    slug: "platinum",
    display_name: "Platinum",
    min_points: 25000,
    perks: ["Highest loyalty tier", "Chef-table / invite windows when offered"],
    sort_order: 4,
  },
];

/**
 * Tier list. Falls back to the seeded reference data if Supabase isn't
 * reachable — safe because those values are committed in 0001_init.sql.
 *
 * Mapping for CS / soft launch:
 * - Bronze → Platinum = points ladder from visits
 * - Founding = first 100 members (paid/recognition track, not a points tier)
 * - Premium ≈ Gold+ access on gated specials/events
 */
export async function getTiers(): Promise<Tier[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tiers")
      .select("*")
      .order("sort_order");
    if (error) throw error;
    if (!data || data.length === 0) return FALLBACK;
    return data as Tier[];
  } catch {
    return FALLBACK;
  }
}

export function tierIcon(slug: TierSlug): string {
  return { bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "👑" }[slug];
}
