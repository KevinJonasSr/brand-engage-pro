import { createClient } from "@/lib/supabase/server";

/**
 * Time-windowed offers a brand publishes to its members.
 * See migration 0024_restaurant_fields_and_specials.sql for the schema.
 *
 * Recurring patterns:
 *   - days_of_week: ISO 8601 ints (1=Mon … 7=Sun). Use this for simple
 *     weekly cases like "every Tuesday" → [2] or "Wed/Thu" → [3,4].
 *   - recurrence_rule: iCal RRULE for anything more complex. Not parsed
 *     in V1 — surfaced as raw text on the brand page.
 *   - One-shot: leave both null and set starts_at/ends_at instead.
 *
 * Tier mirrors brand_events: 'public' | 'premium' | 'founder-only',
 * gated by lib/entitlements.canAccess.
 */
export interface Special {
  id: string;
  brand_slug: string;
  community_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  recurrence_rule: string | null;
  days_of_week: number[] | null;
  redemption_code: string | null;
  points_required: number | null;
  tier: "public" | "premium" | "founder-only";
  sort_order: number;
  active: boolean;
  is_drop: boolean;
  drops_at: string | null;
  expires_at: string | null;
}

/**
 * Fetch active specials for a brand, ordered by sort_order. Public RLS
 * policy on `specials` returns only active rows to anon, so the page
 * renders correctly for logged-out visitors too.
 */
export async function listSpecialsForBrand(
  brandSlug: string,
): Promise<Special[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("specials")
      .select(
        "id, brand_slug, community_id, title, description, image_url, starts_at, ends_at, recurrence_rule, days_of_week, redemption_code, points_required, tier, sort_order, active, is_drop, drops_at, expires_at",
      )
      .eq("brand_slug", brandSlug.toLowerCase())
      .eq("active", true)
      .order("sort_order");
    if (error || !data) return [];
    return data as Special[];
  } catch {
    return [];
  }
}

/**
 * Format the recurrence summary for display.
 * Examples:
 *   [2]      → "Every Tuesday"
 *   [3,4]    → "Wed & Thu"
 *   [1,2,3,4,5] → "Weekdays"
 *   [6,7]    → "Weekends"
 *   null     → returns starts_at/ends_at-derived label or empty string
 */
export function formatRecurrence(s: Special): string {
  // Days array path
  if (s.days_of_week && s.days_of_week.length > 0) {
    const sorted = [...s.days_of_week].sort((a, b) => a - b);
    const setKey = sorted.join(",");
    if (setKey === "1,2,3,4,5") return "Weekdays";
    if (setKey === "6,7") return "Weekends";
    if (setKey === "1,2,3,4,5,6,7") return "Daily";

    const names: Record<number, string> = {
      1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun",
    };
    if (sorted.length === 1) {
      const long: Record<number, string> = {
        1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday",
        5: "Friday", 6: "Saturday", 7: "Sunday",
      };
      return `Every ${long[sorted[0]]}`;
    }
    return sorted.map((d) => names[d]).join(" & ");
  }

  // RRULE path: surface raw text rather than parsing for V1.
  if (s.recurrence_rule) {
    return s.recurrence_rule;
  }

  // One-shot window
  if (s.starts_at && s.ends_at) {
    const start = new Date(s.starts_at).toLocaleDateString();
    const end = new Date(s.ends_at).toLocaleDateString();
    return start === end ? start : `${start} – ${end}`;
  }
  if (s.starts_at) return `From ${new Date(s.starts_at).toLocaleDateString()}`;
  if (s.ends_at) return `Until ${new Date(s.ends_at).toLocaleDateString()}`;
  return "";
}
