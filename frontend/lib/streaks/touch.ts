import type { SupabaseClient } from "@supabase/supabase-js";
// Relative, extension-full imports (like lib/email-campaign.ts) so the unit
// tests can load this module under plain `node --test` without the "@/"
// alias. Both modules depend only on @supabase/supabase-js.
import { createAdminClient } from "../supabase/admin.ts";
import { awardPoints } from "../points/award.ts";

/**
 * Streak touch — call once per Member Home render. Two streaks come back:
 *
 *   - Login streak (days, UTC): the daily "showed up" bonus below. Product
 *     kept the points but the card now demotes this to a footnote.
 *   - Visit streak (weeks, ET): consecutive Mon–Sun weeks with ≥1 check-in
 *     at any brand, read from `checkins` each call, with one-time bonuses at
 *     4 / 8 / 26 / 52 weeks. This is what the card headlines — "streak" to
 *     a restaurant regular means visits, not page loads.
 *
 * Login streak: increments the member's current streak if today is the day after their last
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
  /**
   * Visit streak: consecutive calendar weeks (Mon–Sun, America/New_York)
   * with at least one check-in at any brand. Computed from `checkins` on
   * every call; the current, still-open week does not break the streak
   * until it is over. See computeVisitStreak.
   */
  visitStreakWeeks: number;
  longestVisitStreakWeeks: number;
  /** Next of VISIT_MILESTONE_WEEKS not yet reached; null past 52. */
  nextVisitMilestone: number | null;
  /** 4 / 8 / 26 / 52 when this call credited a visit-streak milestone bonus. */
  newVisitMilestone: number | null;
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

// ---------------------------------------------------------------------------
// Visit streak (weekly, from the checkins table)
// ---------------------------------------------------------------------------

/** Check-ins are day-scoped in ET (lib/data/checkins.ts, 0035 unique index). */
export const VISIT_STREAK_TIME_ZONE = "America/New_York";

/** Milestone bonuses (one-time) at 4 / 8 / 26 / 52 consecutive visit weeks. */
export const VISIT_MILESTONES: Record<number, number> = {
  4: 100,
  8: 250,
  26: 1000,
  52: 2500,
};
export const VISIT_MILESTONE_WEEKS = [4, 8, 26, 52] as const;

/** One visit-streak milestone bonus per member per milestone, ever. */
export function visitStreakMilestoneSourceRef(memberId: string, weeks: number): string {
  return `visit-streak-milestone:${memberId}:${weeks}`;
}

/**
 * Most recent check-in rows we read per touch. One check-in per brand per
 * day means a 52-week streak at one brand needs 52 rows; the cap only
 * matters for a member who checks in at several brands every day for
 * years, and even then it truncates the count far past the top milestone.
 */
export const VISIT_STREAK_ROW_CAP = 2000;

/** Civil date (YYYY-MM-DD) of `at` in the brand time zone. */
export function visitDateET(at: Date): string {
  return at.toLocaleDateString("en-CA", { timeZone: VISIT_STREAK_TIME_ZONE });
}

/**
 * Week bucket of a civil date: whole weeks since the Monday of the epoch
 * week (1969-12-29). Weeks run Monday–Sunday so a Friday dinner and the
 * Sunday brunch after it count as the same week — restaurant regulars are
 * weekend regulars. 1970-01-01 was a Thursday, hence the +3.
 */
export function weekIndexOfDate(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const days = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return Math.floor((days + 3) / 7);
}

/** Week bucket of an instant, measured on its ET calendar date. */
export function weekIndexOf(at: Date): number {
  return weekIndexOfDate(visitDateET(at));
}

export interface VisitStreak {
  currentWeeks: number;
  longestWeeks: number;
  /** True when the member has already checked in during the current week. */
  visitedThisWeek: boolean;
}

/**
 * Pure weekly-streak arithmetic. `checkinTimes` are check-in instants (any
 * order, any brand); `now` fixes the current week.
 *
 * Rule: the streak is the run of consecutive weeks with ≥1 check-in that
 * ends in the current week or, because the current week is still open,
 * in the week before it. A member who visited last week but not yet this
 * week keeps their streak; it only breaks once a whole week passes with
 * no visit. Longest is the longest such run anywhere in the rows given.
 */
export function computeVisitStreak(
  checkinTimes: Array<Date | string>,
  now: Date,
): VisitStreak {
  const weeks = new Set<number>();
  for (const t of checkinTimes) {
    const d = t instanceof Date ? t : new Date(t);
    if (Number.isFinite(d.getTime())) weeks.add(weekIndexOf(d));
  }
  if (weeks.size === 0) {
    return { currentWeeks: 0, longestWeeks: 0, visitedThisWeek: false };
  }

  const thisWeek = weekIndexOf(now);
  const visitedThisWeek = weeks.has(thisWeek);
  let currentWeeks = 0;
  let cursor = visitedThisWeek ? thisWeek : weeks.has(thisWeek - 1) ? thisWeek - 1 : null;
  while (cursor !== null && weeks.has(cursor)) {
    currentWeeks += 1;
    cursor -= 1;
  }

  // Longest run: walk the sorted distinct weeks (ignore weeks after `now`,
  // which can only come from clock skew).
  let longestWeeks = 0;
  let run = 0;
  let prev: number | null = null;
  for (const w of Array.from(weeks).filter((w) => w <= thisWeek).sort((a, b) => a - b)) {
    run = prev !== null && w === prev + 1 ? run + 1 : 1;
    if (run > longestWeeks) longestWeeks = run;
    prev = w;
  }

  return { currentWeeks, longestWeeks: Math.max(longestWeeks, currentWeeks), visitedThisWeek };
}

/** Next visit milestone (in weeks) above `currentWeeks`; null past the top. */
export function nextVisitMilestone(currentWeeks: number): number | null {
  for (const m of VISIT_MILESTONE_WEEKS) {
    if (currentWeeks < m) return m;
  }
  return null;
}

/** Benign zero-state for the visit-streak fields. */
const NO_VISIT_STREAK = {
  visitStreakWeeks: 0,
  longestVisitStreakWeeks: 0,
  nextVisitMilestone: VISIT_MILESTONE_WEEKS[0] as number | null,
  newVisitMilestone: null as number | null,
};

type VisitStreakFields = typeof NO_VISIT_STREAK;

/**
 * Read the member's check-ins, compute the weekly visit streak and, when
 * the streak sits exactly on a milestone, credit the one-time bonus. The
 * bonus goes through awardPoints with a deterministic source_ref, so a
 * repeat render in the same milestone week is a no-op (awarded: false).
 *
 * Own try/catch: a checkins hiccup must not take the login streak down
 * with it, and vice versa.
 */
async function touchVisitStreak(
  admin: SupabaseClient,
  memberId: string,
  now: Date,
): Promise<VisitStreakFields> {
  try {
    const { data: rows, error } = await admin
      .from("checkins")
      .select("created_at")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(VISIT_STREAK_ROW_CAP);
    if (error) throw error;

    const streak = computeVisitStreak(
      ((rows ?? []) as Array<{ created_at: string }>).map((r) => r.created_at),
      now,
    );
    const fields: VisitStreakFields = {
      visitStreakWeeks: streak.currentWeeks,
      longestVisitStreakWeeks: streak.longestWeeks,
      nextVisitMilestone: nextVisitMilestone(streak.currentWeeks),
      newVisitMilestone: null,
    };

    const milestone = streak.currentWeeks in VISIT_MILESTONES ? streak.currentWeeks : null;
    if (milestone) {
      const result = await awardPoints(admin, {
        memberId,
        delta: VISIT_MILESTONES[milestone],
        source: STREAK_LEDGER_SOURCE,
        sourceRef: visitStreakMilestoneSourceRef(memberId, milestone),
        note: `${milestone}-week visit streak milestone`,
      });
      if (result.awarded) {
        fields.newVisitMilestone = milestone;
        await admin.from("streak_log").insert([
          {
            member_id: memberId,
            event_type: "milestone",
            streak_days: milestone * 7,
            points_awarded: result.delta,
            metadata: { kind: "visit_streak_milestone", weeks: milestone },
          },
        ]);
      }
    }
    return fields;
  } catch (err) {
    console.warn("touchVisitStreak failed (non-blocking):", err);
    return { ...NO_VISIT_STREAK };
  }
}

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
  const benign: StreakState = { ...BENIGN_LOGIN_STREAK, ...NO_VISIT_STREAK };
  if (!memberId) return benign;

  let admin: SupabaseClient;
  try {
    admin = options.admin ?? createAdminClient();
  } catch (err) {
    console.warn("touchStreak failed (non-blocking):", err);
    return benign;
  }
  const now = options.now ?? new Date();

  // The two halves read different tables and fail independently.
  const [login, visit] = await Promise.all([
    touchLoginStreak(admin, memberId, now),
    touchVisitStreak(admin, memberId, now),
  ]);
  return { ...login, ...visit };
}

type LoginStreakState = Omit<StreakState, keyof VisitStreakFields>;

const BENIGN_LOGIN_STREAK: LoginStreakState = {
  currentStreakDays: 0,
  longestStreakDays: 0,
  lastActiveDate: null,
  pointsAwardedThisVisit: 0,
  newMilestone: null,
  isNewToday: false,
};

/** The daily login half of touchStreak (see the doc comment above). */
async function touchLoginStreak(
  admin: SupabaseClient,
  memberId: string,
  today: Date,
): Promise<LoginStreakState> {
  const benign = BENIGN_LOGIN_STREAK;

  try {
    const { data: member, error: fetchError } = await admin
      .from("members")
      .select("id, current_streak_days, longest_streak_days, last_active_date")
      .eq("id", memberId)
      .maybeSingle();

    if (fetchError || !member) return benign;

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
    console.warn("touchLoginStreak failed (non-blocking):", err);
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
