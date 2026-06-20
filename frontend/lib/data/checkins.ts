import { createAdminClient } from "@/lib/supabase/admin";

export const CHECKIN_POINTS = 25;

export type CheckinResult =
  | { ok: true; alreadyCheckedIn: false; pointsAwarded: number }
  | { ok: true; alreadyCheckedIn: true; pointsAwarded: 0 }
  | { ok: false; error: string };

/**
 * Record a visit check-in for a member at a brand location.
 * Idempotent: one check-in per member per brand per calendar day (ET).
 */
export async function recordCheckin(
  memberId: string,
  brandSlug: string,
): Promise<CheckinResult> {
  const admin = createAdminClient();

  const todayET = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  }); // YYYY-MM-DD

  // Has this member already checked in today?
  const { data: existing } = await admin
    .from("checkins")
    .select("id")
    .eq("member_id", memberId)
    .eq("brand_slug", brandSlug)
    .gte("created_at", `${todayET}T00:00:00-05:00`)
    .maybeSingle();

  if (existing) {
    return { ok: true, alreadyCheckedIn: true, pointsAwarded: 0 };
  }

  // Insert checkin row
  const { error: checkinErr } = await admin.from("checkins").insert({
    member_id: memberId,
    brand_slug: brandSlug,
    points_awarded: CHECKIN_POINTS,
  });
  if (checkinErr) return { ok: false, error: checkinErr.message };

  // Award points with idempotency key
  const sourceRef = `checkin:${brandSlug}:${memberId}:${todayET}`;
  const { data: existingPts } = await admin
    .from("points_ledger")
    .select("id")
    .eq("source_ref", sourceRef)
    .maybeSingle();

  if (!existingPts) {
    await admin.from("points_ledger").insert({
      member_id: memberId,
      delta: CHECKIN_POINTS,
      source: "daily_checkin",
      source_ref: sourceRef,
      note: `Visit check-in at ${brandSlug}`,
    });

    // Increment denormalized total — read-then-write is acceptable here since
    // the unique index on checkins already prevents concurrent check-ins.
    const { data: m } = await admin
      .from("members")
      .select("total_points")
      .eq("id", memberId)
      .single();
    if (m) {
      await admin
        .from("members")
        .update({ total_points: ((m.total_points as number) ?? 0) + CHECKIN_POINTS })
        .eq("id", memberId);
    }

    // Also bump community membership points if the member follows this brand
    const { data: mem } = await admin
      .from("member_community_memberships")
      .select("total_points")
      .eq("member_id", memberId)
      .eq("community_id", brandSlug)
      .maybeSingle();
    if (mem) {
      await admin
        .from("member_community_memberships")
        .update({ total_points: ((mem.total_points as number) ?? 0) + CHECKIN_POINTS })
        .eq("member_id", memberId)
        .eq("community_id", brandSlug);
    }
  }

  return { ok: true, alreadyCheckedIn: false, pointsAwarded: CHECKIN_POINTS };
}

/** Count a member's total check-ins at a specific brand (all time). */
export async function getMemberCheckinCount(
  memberId: string,
  brandSlug: string,
): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("checkins")
    .select("*", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("brand_slug", brandSlug);
  return count ?? 0;
}

/** Count how many distinct members have checked in at a brand today. */
export async function getBrandCheckinsToday(brandSlug: string): Promise<number> {
  const admin = createAdminClient();
  const todayET = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  const { count } = await admin
    .from("checkins")
    .select("*", { count: "exact", head: true })
    .eq("brand_slug", brandSlug)
    .gte("created_at", `${todayET}T00:00:00-05:00`);
  return count ?? 0;
}
