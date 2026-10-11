import { createAdminClient } from "@/lib/supabase/admin";
import {
  RESULTS_BRAND_SLUG,
  summarizeGuestResults,
  type GuestResults,
  type GuestVisitRow,
} from "@/lib/guest-results";

const PAGE_SIZE = 1000;
// Safety stop so a runaway table can never hang the homepage.
const MAX_PAGES = 50;

type CheckinWithMember = {
  member_id: string;
  created_at: string;
  members: { email: string | null } | null;
};

/**
 * Real-guest visit numbers for the homepage results section.
 * Returns null on any error so the signed-out landing never breaks.
 */
export async function getGuestResults(): Promise<GuestResults | null> {
  try {
    const admin = createAdminClient();
    const rows: GuestVisitRow[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const { data, error } = await admin
        .from("checkins")
        .select("member_id, created_at, members(email)")
        .eq("brand_slug", RESULTS_BRAND_SLUG)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
        .returns<CheckinWithMember[]>();
      if (error) {
        console.error("[guest-results] checkins query failed:", error.message);
        return null;
      }
      rows.push(
        ...data.map((r) => ({
          member_id: r.member_id,
          created_at: r.created_at,
          email: r.members?.email ?? null,
        })),
      );
      if (data.length < PAGE_SIZE) return summarizeGuestResults(rows);
    }

    // Hit the safety stop: the count would be incomplete, so show nothing.
    console.error("[guest-results] too many check-ins to count safely");
    return null;
  } catch (err) {
    console.error("[guest-results] failed:", err);
    return null;
  }
}
