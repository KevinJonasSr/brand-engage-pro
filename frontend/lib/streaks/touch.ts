import type { SupabaseClient } from "@supabase/supabase-js";
// Relative, extension-full imports (like lib/email-campaign.ts) so the unit
// tests can load this module under plain `node --test` without the "@/"
// alias. Both modules depend only on @supabase/supabase-js.
import { createAdminClient } from "../supabase/admin.ts";
import { awardPoints } from "../points/award.ts";

/**
 * Daily streak touch — call once per Member Home render.
 *
 * Increments the member's current streak if today is the day after their last
 * active date, resets to 1 if more than a day has passed, and no-ops if
 * we've already counted them today.
 *
 * Awards a small daily-login bonus (scales with streak length) and a
 * milestone bonus when a member hits 7 / 30 / 100 / 365 days. Each event is
 * logged to public.streak_log for audit + UI debugging.
 *
 * Points go through awardPoints (lib/points/award.ts): one points_ledger row
 * per grant with a deterministic source_ref, totals moved by the
 * add_member_points RPC. Streak day / longest bookkeeping stays on the
 * members row; it is claimed with a conditional UPDATE so two renders on the
 * same day cannot both count it.
 *
 * Returns the post-touch streak state so the caller can render it without
 * a second round-trip.
 *
 * BEP-specific (vs FE): queries `members` table with `id` PK = auth.uid(),
 * uses `member_brand_following.brand_slug` for the badge community fallback,
 * and writes to `member_badges` (not `fan_badges`).
 */

export interface StreakState {
  currentStreakDays: number;
  longestStreakDays: number;
  lastActiveDate: string | null;
  pointsAwardedThisVisit: number;
  newMilestone: number | null; // 7 / 30 / 100 / 365 — null if no milestone hit
  isNewToday: boolean;          // true if we incremented or reset on this call
}

/**
 * Ledger `source` for streak grants. point_source (0001) has no streak value
 * and enum changes need their own migration, so streak bonuses are filed
 * under 'daily_checkin' ("Daily check-ins" in the breakdown) and told apart
 * by their source_ref prefix. Milestone rows say so in their note.
 */
export const STREAK_LEDGER_SOURCE = "daily_checkin";

/** One daily bonus per member per UTC day. */
export function streakSourceRef(memberId: string, dateStr: string): string {
  return `streak:${memberId}:${dateStr}`;
}

/** One milestone bonus per member per milestone, ever. */
export function streakMilestoneSourceRef(memberId: string, milestone: number): string {
  return `streak-milestone:${memberId}:${milestone}`;
}

/** Daily-login bonus scales with streak length. */
export function dailyBonusForStreak(streakDays: number): number {
  if (streakDays >= 100) return 20;
  if (streakDays >= 30) return 15;
  if (streakDays >= 7) return 10;
  return 5;
}

/** Milestone bonuses (one-time) at 7 / 30 / 100 / 365 days. */
export const MILESTONES: Record<number, number> = {
  7: 50,
  30: 200,
  100: 1000,
  365: 5000,
};

/** True when `today` is exactly one calendar day after `lastDate` (UTC). */
function isConsecutiveDay(today: Date, lastDate: Date): boolean {
  const oneDayMs = 24 * 60 * 60 * 1000;
  const todayMidnight = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const lastMidnight = Date.UTC(
    lastDate.getUTCFullYear(),
    lastDate.getUTCMonth(),
    lastDate.getUTCDate(),
  );
  return todayMidnight - lastMidnight === oneDayMs;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export type StreakEventType = "increment" | "reset" | "first_visit" | "no_op";

export interface StreakTransition {
  eventType: StreakEventType;
  currentStreak: number;
  newLongest: number;
  dailyBonus: number;
  milestoneHit: number | null;
  milestoneBonus: number;
}

/**
 * Pure streak arithmetic for one touch. `lastActiveDate` is YYYY-MM-DD (UTC)
 * or null for a member who has never been counted.
 */
export function computeStreakTransition(
  member: {
    current_streak_days: number | null;
    longest_streak_days: number | null;
    last_active_date: string | null;
  },
  today: Date,
): StreakTransition {
  let currentStreak = member.current_streak_days ?? 0;
  const longestSoFar = member.longest_streak_days ?? 0;
  const lastActive = member.last_active_date
    ? new Date(`${member.last_active_date}T00:00:00Z`)
    : null;

  let eventType: StreakEventType;
  if (!lastActive) {
    currentStreak = 1;
    eventType = "first_visit";
  } else if (isSameDay(today, lastActive)) {
    return {
      eventType: "no_op",
      currentStreak,
      newLongest: longestSoFar,
      dailyBonus: 0,
      milestoneHit: null,
      milestoneBonus: 0,
    };
  } else if (isConsecutiveDay(today, lastActive)) {
    currentStreak += 1;
    eventType = "increment";
  } else {
    currentStreak = 1;
    eventType = "reset";
  }

  // Key lookup, not value: the old `MILESTONES[n] ?? null` returned the
  // bonus amount (50) as the milestone and so stamped `streak-50` badges.
  const milestoneHit = currentStreak in MILESTONES ? currentStreak : null;
  return {
    eventType,
    currentStreak,
    newLongest: Math.max(longestSoFar, currentStreak),
    dailyBonus: dailyBonusForStreak(currentStreak),
    milestoneHit,
    milestoneBonus: milestoneHit ? MILESTONES[currentStreak] : 0,
  };
}

export interface TouchStreakOptions {
  /** Injected for tests; defaults to the service-role client. */
  admin?: SupabaseClient;
  /** Injected for tests; defaults to `new Date()`. */
  now?: Date;
}

/**
 * Touch the streak for a member. Idempotent within the same calendar day:
 * the members row is claimed with a conditional UPDATE (last_active_date is
 * still before today), and every point grant carries a deterministic
 * source_ref, so a retry or two concurrent renders award once.
 *
 * Returns the post-touch streak state.
 *
 * Failure mode: if anything throws (Supabase down, missing member id, etc.)
 * we swallow the error and return a benign zero-state. Streak is a UX
 * affordance, not a contract — never block Member Home from rendering.
 */
export async function touchStreak(
  memberId: string,
  options: TouchStreakOptions = {},
): Promise<StreakState> {
  const benign: StreakState = {
    currentStreakDays: 0,
    longestStreakDays: 0,
    lastActiveDate: null,
    pointsAwardedThisVisit: 0,
    newMilestone: null,
    isNewToday: false,
  };

  if (!memberId) return benign;

  try {
    const admin = options.admin ?? createAdminClient();
    const { data: member, error: fetchError } = await admin
      .from("members")
      .select("id, current_streak_days, longest_streak_days, last_active_date")
      .eq("id", memberId)
      .maybeSingle();

    if (fetchError || !member) return benign;

    const today = options.now ?? new Date();
    const todayDateStr = today.toISOString().slice(0, 10); // YYYY-MM-DD UTC

    const t = computeStreakTransition(
      member as {
        current_streak_days: number | null;
        longest_streak_days: number | null;
        last_active_date: string | null;
      },
      today,
    );

    if (t.eventType === "no_op") {
      // Already counted today — pure no-op, no points awarded.
      return {
        currentStreakDays: t.currentStreak,
        longestStreakDays: t.newLongest,
        lastActiveDate: member.last_active_date as string,
        pointsAwardedThisVisit: 0,
        newMilestone: null,
        isNewToday: false,
      };
    }

    // 1. Claim today on the member row. The filter only matches while
    //    last_active_date is still before today, so of two concurrent
    //    renders exactly one gets a row back; the other stops here.
    //    Points are no longer written to this row (see awardPoints below).
    const updates: Record<string, unknown> = {
      current_streak_days: t.currentStreak,
      longest_streak_days: t.newLongest,
      last_active_date: todayDateStr,
    };
    if (t.eventType === "first_visit" || t.eventType === "reset") {
      updates.streak_started_at = today.toISOString();
    }
    const { data: claimed, error: claimError } = await admin
      .from("members")
      .update(updates)
      .eq("id", memberId)
      .or(`last_active_date.is.null,last_active_date.lt.${todayDateStr}`)
      .select("id");
    if (claimError) throw claimError;
    if (!claimed || claimed.length === 0) {
      return {
        currentStreakDays: t.currentStreak,
        longestStreakDays: t.newLongest,
        lastActiveDate: todayDateStr,
        pointsAwardedThisVisit: 0,
        newMilestone: null,
        isNewToday: false,
      };
    }

    // 2. Points, through the ledger. awardPoints resolves the community the
    //    same way every other grant does, and the 0059 unique index on
    //    source_ref makes a repeat a no-op that reports awarded: false.
    const daily = await awardPoints(admin, {
      memberId,
      delta: t.dailyBonus,
      source: STREAK_LEDGER_SOURCE,
      sourceRef: streakSourceRef(memberId, todayDateStr),
      note: `Daily streak bonus (day ${t.currentStreak})`,
    });
    let totalAwarded = daily.delta;
    let milestoneAwarded = 0;
    if (t.milestoneHit) {
      const milestone = await awardPoints(admin, {
        memberId,
        delta: t.milestoneBonus,
        source: STREAK_LEDGER_SOURCE,
        sourceRef: streakMilestoneSourceRef(memberId, t.milestoneHit),
        note: `${t.milestoneHit}-day streak milestone`,
      });
      milestoneAwarded = milestone.delta;
      totalAwarded += milestoneAwarded;
    }

    // 3. Audit log — records what was actually credited.
    await admin.from("streak_log").insert([
      {
        member_id: memberId,
        event_type: t.eventType,
        streak_days: t.currentStreak,
        points_awarded: daily.delta,
        metadata: { kind: "daily_bonus" },
      },
      ...(t.milestoneHit
        ? [
            {
              member_id: memberId,
              event_type: "milestone" as const,
              streak_days: t.currentStreak,
              points_awarded: milestoneAwarded,
              milestone_days: t.milestoneHit,
              metadata: { badge_slug: `streak-${t.milestoneHit}` },
            },
          ]
        : []),
    ]);

    // 4. Award the badge if a milestone was hit. BEP table is `member_badges`
    //    with columns: member_id, badge_slug, earned_at, community_id (NOT NULL).
    //    Streak badges are platform-level, but the column requires a value
    //    so we use the member's first followed brand if known, else fall
    //    back to the seed default 'nellies'. Idempotent on (member_id, badge_slug).
    if (t.milestoneHit) {
      const { data: firstFollow } = await admin
        .from("member_brand_following")
        .select("brand_slug")
        .eq("member_id", memberId)
        .order("followed_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const communityId =
        (firstFollow?.brand_slug as string | undefined) ?? "nellies";

      await admin
        .from("member_badges")
        .upsert(
          {
            member_id: memberId,
            badge_slug: `streak-${t.milestoneHit}`,
            earned_at: today.toISOString(),
            community_id: communityId,
          },
          { onConflict: "member_id,badge_slug", ignoreDuplicates: true },
        );
    }

    return {
      currentStreakDays: t.currentStreak,
      longestStreakDays: t.newLongest,
      lastActiveDate: todayDateStr,
      pointsAwardedThisVisit: totalAwarded,
      newMilestone: t.milestoneHit,
      isNewToday: true,
    };
  } catch (err) {
    // Streak is non-essential — never let it crash Member Home.
    console.warn("touchStreak failed (non-blocking):", err);
    return benign;
  }
}

/** Days until next milestone. Returns null if past the highest milestone. */
export function daysToNextMilestone(currentStreak: number): {
  next: number;
  daysRemaining: number;
} | null {
  for (const m of [7, 30, 100, 365]) {
    if (currentStreak < m) {
      return { next: m, daysRemaining: m - currentStreak };
    }
  }
  return null;
}
