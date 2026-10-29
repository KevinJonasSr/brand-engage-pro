import { createAdminClient } from "@/lib/supabase/admin";
import { isPremiumTier } from "@/lib/entitlements";
import { ledgerNote, pointsMultiplier, scaledPoints } from "@/lib/founder-perks";
import { emitNetworkEvent } from "@/lib/network";
import { awardPoints } from "@/lib/points/award";
import { getLifetimePoints, getSpendablePoints } from "@/lib/data/member";
import { tierProgress } from "@/lib/data/member-points";
import { getStampCardData } from "@/lib/data/stamp-card";
import { getTiers } from "@/lib/data/tiers";

export const CHECKIN_POINTS = 25;

/** Ledger idempotency key: one visit award per member per brand per ET day. */
export function checkinSourceRef(
  brandSlug: string,
  memberId: string,
  dateET: string,
): string {
  return `checkin:${brandSlug}:${memberId}:${dateET}`;
}

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

  // Founders earn a flat 1.5x, including this QR check-in. A failed membership
  // lookup still records the visit at the base rate.
  const flags = await checkinPointFlags(admin, memberId, brandSlug);
  const multiplier = pointsMultiplier(flags);
  const pointsAwarded = scaledPoints(CHECKIN_POINTS, multiplier);
  const note = ledgerNote(`Visit check-in at ${brandSlug}`, flags);

  // Insert checkin row
  const { error: checkinErr } = await admin.from("checkins").insert({
    member_id: memberId,
    brand_slug: brandSlug,
    points_awarded: pointsAwarded,
  });
  if (checkinErr) {
    // The per-day unique index caught a check-in the lookup above missed
    // (a race, or the lookup's fixed -05:00 offset during daylight time).
    if (checkinErr.code === "23505") {
      return { ok: true, alreadyCheckedIn: true, pointsAwarded: 0 };
    }
    return { ok: false, error: checkinErr.message };
  }

  // Award points through the ledger. The source_ref keeps the shape already
  // in production (`checkin:<brand>:<member>:<date>`) so a retry of today's
  // check-in collides with the row that is already there. The 0059 unique
  // index rejects the repeat and awardPoints then leaves both totals alone;
  // otherwise add_member_points (0061) moves members.total_points and the
  // brand membership total in one atomic UPDATE each (and the membership
  // bump is a no-op when the member does not follow this brand).
  const { awarded } = await awardPoints(admin, {
    memberId,
    delta: pointsAwarded,
    source: "daily_checkin",
    sourceRef: checkinSourceRef(brandSlug, memberId, todayET),
    note,
    communityId: brandSlug,
  });

  if (awarded) {
    // Jonas Network: report the check-in. Day-scoped dedupe mirrors the
    // app's own one-per-day idempotency above.
    emitNetworkEvent({
      event_type: "event.checkin",
      local_actor_id: memberId,
      artist_slug: brandSlug,
      entity_type: "community",
      entity_id: brandSlug,
      dedupe_key: `be:checkin:${brandSlug}:${memberId}:${todayET}`,
      metadata: { community_id: brandSlug, points_awarded: pointsAwarded },
    });
  }

  return { ok: true, alreadyCheckedIn: false, pointsAwarded };
}

async function checkinPointFlags(
  admin: ReturnType<typeof createAdminClient>,
  memberId: string,
  brandSlug: string,
): Promise<{ isFounder: boolean; isPremium: boolean }> {
  const { data, error } = await admin
    .from("member_community_memberships")
    .select("is_founder, subscription_tier")
    .eq("member_id", memberId)
    .eq("community_id", brandSlug)
    .maybeSingle();
  if (error) {
    console.warn("recordCheckin: membership lookup failed", error.message);
    return { isFounder: false, isPremium: false };
  }
  return {
    isFounder: Boolean(data?.is_founder),
    isPremium: isPremiumTier((data?.subscription_tier as string | null) ?? null),
  };
}

/** Progress snapshot returned with a check-in so the client can show a moment, not just a number. */
export type CheckinProgress = {
  /** Net ledger balance the member can spend right now. */
  spendablePoints: number;
  /** All-time check-ins at this brand (this one included). */
  visitCount: number;
  /** Member-wide daily streak (members.current_streak_days), 0 when unknown. */
  streakDays: number;
  /** Stamp card progress, or null when the brand has no active card. */
  stampCard: {
    stampsEarned: number;
    stampsRequired: number;
    rewardTitle: string;
    visitsRemaining: number;
    justCompleted: boolean;
  } | null;
  /** Next tier on the ladder, or null at the top (or when unavailable). */
  nextTier: { name: string; pointsToNext: number } | null;
};

/**
 * Gather the post-check-in progress snapshot. Every lookup is best-effort:
 * a failed read degrades to 0 / null rather than failing the check-in.
 */
export async function getCheckinProgress(
  memberId: string,
  brandSlug: string,
): Promise<CheckinProgress> {
  const admin = createAdminClient();
  const quiet = <T>(p: Promise<T>, fallback: T): Promise<T> =>
    p.catch((err: unknown) => {
      console.warn("getCheckinProgress: lookup failed", err);
      return fallback;
    });

  const [spendablePoints, lifetimePoints, visitCount, stamp, streakRes, tiers] =
    await Promise.all([
      quiet(getSpendablePoints(memberId), 0),
      quiet(getLifetimePoints(memberId), 0),
      quiet(getMemberCheckinCount(memberId, brandSlug), 0),
      quiet(getStampCardData(brandSlug, memberId), null),
      quiet(
        Promise.resolve(
          admin
            .from("members")
            .select("current_streak_days")
            .eq("id", memberId)
            .maybeSingle(),
        ).then((r) => r.data as { current_streak_days: number | null } | null),
        null,
      ),
      quiet(getTiers(), []),
    ]);

  const { next_tier, points_to_next_tier } = tierProgress(
    tiers,
    Math.max(lifetimePoints, spendablePoints),
  );

  return {
    spendablePoints,
    visitCount,
    streakDays: Math.max(0, streakRes?.current_streak_days ?? 0),
    stampCard: stamp
      ? {
          stampsEarned: stamp.stampsInCurrentRound,
          stampsRequired: stamp.stampsRequired,
          rewardTitle: stamp.rewardTitle,
          visitsRemaining: stamp.visitsRemaining,
          justCompleted: stamp.justCompleted,
        }
      : null,
    nextTier:
      next_tier && points_to_next_tier !== null
        ? { name: next_tier.display_name, pointsToNext: points_to_next_tier }
        : null,
  };
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
