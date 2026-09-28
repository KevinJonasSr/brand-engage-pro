import { createAdminClient } from "@/lib/supabase/admin";
import { emitNetworkEvent } from "@/lib/network";

export const CHECKIN_POINTS = 25;

export type CheckinResult =
  | { ok: true; alreadyCheckedIn: false; pointsAwarded: number }
  | { ok: true; alreadyCheckedIn: true; pointsAwarded: 0 }
  | { ok: false; error: string; unknownBrand?: true };

/**
 * Record a visit check-in for a member at a brand location.
 * Idempotent: one check-in per member per brand per calendar day (ET).
 */
export async function recordCheckin(
  memberId: string,
  brandSlug: string,
): Promise<CheckinResult> {
  const admin = createAdminClient();

  // The slug comes from the request body, so it must name a real brand
  // (0059 also enforces this with a foreign key).
  const { data: brand, error: brandErr } = await admin
    .from("brands")
    .select("slug")
    .eq("slug", brandSlug)
    .maybeSingle();
  if (brandErr) return { ok: false, error: brandErr.message };
  if (!brand) return { ok: false, error: "Unknown brand", unknownBrand: true };

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
  if (checkinErr) {
    // The per-day unique index caught a check-in the lookup above missed
    // (a race, or the lookup's fixed -05:00 offset during daylight time).
    if (checkinErr.code === "23505") {
      return { ok: true, alreadyCheckedIn: true, pointsAwarded: 0 };
    }
    return { ok: false, error: checkinErr.message };
  }

  // Award points with idempotency key
  const sourceRef = `checkin:${brandSlug}:${memberId}:${todayET}`;
  // The 0059 ledger unique index makes this insert the idempotency check:
  // totals only move when the ledger row was actually written.
  const { error: ledgerErr } = await admin.from("points_ledger").insert({
    member_id: memberId,
    delta: CHECKIN_POINTS,
    source: "daily_checkin",
    source_ref: sourceRef,
    note: `Visit check-in at ${brandSlug}`,
  });
  if (ledgerErr && ledgerErr.code !== "23505") {
    console.warn("recordCheckin: ledger insert failed", ledgerErr);
  }

  if (!ledgerErr) {
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
    // Jonas Network: report the check-in. Day-scoped dedupe mirrors the
    // app's own one-per-day idempotency above.
    emitNetworkEvent({
      event_type: "event.checkin",
      local_actor_id: memberId,
      artist_slug: brandSlug,
      entity_type: "community",
      entity_id: brandSlug,
      dedupe_key: `be:checkin:${brandSlug}:${memberId}:${todayET}`,
      metadata: { community_id: brandSlug, points_awarded: CHECKIN_POINTS },
    });
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
