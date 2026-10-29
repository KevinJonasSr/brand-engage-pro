import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { fakeSupabase } from "../points/fake-supabase.test-helper.ts";
import {
  MILESTONES,
  STREAK_LEDGER_SOURCE,
  VISIT_MILESTONES,
  computeStreakTransition,
  computeVisitStreak,
  dailyBonusForStreak,
  daysToNextMilestone,
  nextVisitMilestone,
  streakMilestoneSourceRef,
  streakSourceRef,
  touchStreak,
  visitDateET,
  visitStreakMilestoneSourceRef,
  weekIndexOf,
  weekIndexOfDate,
} from "./touch.ts";

const touchSrc = readFileSync(
  fileURLToPath(new URL("./touch.ts", import.meta.url)),
  "utf8",
);

const TODAY = new Date("2026-10-29T15:00:00Z");

describe("streak arithmetic", () => {
  it("first visit starts at 1 with the base bonus", () => {
    const t = computeStreakTransition(
      { current_streak_days: 0, longest_streak_days: 0, last_active_date: null },
      TODAY,
    );
    assert.equal(t.eventType, "first_visit");
    assert.equal(t.currentStreak, 1);
    assert.equal(t.dailyBonus, 5);
    assert.equal(t.milestoneHit, null);
  });

  it("same day is a no-op with no points", () => {
    const t = computeStreakTransition(
      { current_streak_days: 3, longest_streak_days: 9, last_active_date: "2026-10-29" },
      TODAY,
    );
    assert.equal(t.eventType, "no_op");
    assert.equal(t.currentStreak, 3);
    assert.equal(t.newLongest, 9);
    assert.equal(t.dailyBonus, 0);
  });

  it("consecutive day increments; a gap resets to 1", () => {
    const inc = computeStreakTransition(
      { current_streak_days: 3, longest_streak_days: 3, last_active_date: "2026-10-28" },
      TODAY,
    );
    assert.equal(inc.eventType, "increment");
    assert.equal(inc.currentStreak, 4);
    assert.equal(inc.newLongest, 4);

    const reset = computeStreakTransition(
      { current_streak_days: 3, longest_streak_days: 3, last_active_date: "2026-10-26" },
      TODAY,
    );
    assert.equal(reset.eventType, "reset");
    assert.equal(reset.currentStreak, 1);
    assert.equal(reset.newLongest, 3);
  });

  it("hits the 7-day milestone exactly once at day 7", () => {
    const t = computeStreakTransition(
      { current_streak_days: 6, longest_streak_days: 6, last_active_date: "2026-10-28" },
      TODAY,
    );
    assert.equal(t.milestoneHit, 7);
    assert.equal(t.milestoneBonus, MILESTONES[7]);
    assert.equal(t.dailyBonus, 10);
    assert.equal(dailyBonusForStreak(6), 5);
    assert.equal(dailyBonusForStreak(30), 15);
    assert.equal(dailyBonusForStreak(100), 20);
    assert.deepEqual(daysToNextMilestone(7), { next: 30, daysRemaining: 23 });
    assert.equal(daysToNextMilestone(365), null);
  });

  it("source refs are deterministic per member/day and per milestone", () => {
    assert.equal(streakSourceRef("m1", "2026-10-29"), "streak:m1:2026-10-29");
    assert.equal(streakMilestoneSourceRef("m1", 30), "streak-milestone:m1:30");
    // point_source has no streak value; enum changes need their own migration.
    assert.equal(STREAK_LEDGER_SOURCE, "daily_checkin");
  });
});

describe("touchStreak writes points through the ledger", () => {
  const member = {
    id: "m1",
    current_streak_days: 6,
    longest_streak_days: 6,
    last_active_date: "2026-10-28",
  };

  it("claims the day, awards daily + milestone via awardPoints, logs both", async () => {
    const { client, calls, rpcs } = fakeSupabase((call) => {
      if (call.table === "members" && call.op === "select") return { data: member, error: null };
      if (call.table === "members" && call.op === "update") return { data: [{ id: "m1" }], error: null };
      if (call.table === "member_community_memberships") return { data: [{ community_id: "nellies" }], error: null };
      return { data: null, error: null };
    });

    const state = await touchStreak("m1", { admin: client, now: TODAY });
    assert.equal(state.isNewToday, true);
    assert.equal(state.currentStreakDays, 7);
    assert.equal(state.newMilestone, 7);
    assert.equal(state.pointsAwardedThisVisit, 10 + 50);

    // Streak bookkeeping stays on the members row — but never total_points.
    const claim = calls.find((c) => c.table === "members" && c.op === "update");
    assert.ok(claim);
    assert.deepEqual(claim.args[0], {
      current_streak_days: 7,
      longest_streak_days: 7,
      last_active_date: "2026-10-29",
    });
    assert.ok(claim.chain.includes("or"), "claim is conditional on last_active_date");
    assert.ok(claim.chain.includes("select"), "claim reads back the row it won");

    const ledger = calls.filter((c) => c.table === "points_ledger");
    assert.deepEqual(ledger.map((c) => c.args[0]), [
      {
        member_id: "m1",
        delta: 10,
        source: "daily_checkin",
        community_id: "nellies",
        source_ref: "streak:m1:2026-10-29",
        note: "Daily streak bonus (day 7)",
      },
      {
        member_id: "m1",
        delta: 50,
        source: "daily_checkin",
        community_id: "nellies",
        source_ref: "streak-milestone:m1:7",
        note: "7-day streak milestone",
      },
    ]);
    assert.deepEqual(
      rpcs.map((r) => (r.args as { p_delta: number }).p_delta),
      [10, 50],
    );

    const log = calls.find((c) => c.table === "streak_log");
    assert.ok(log);
    const rows = log.args[0] as Array<{ event_type: string; points_awarded: number }>;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].points_awarded, 10);
    assert.equal(rows[1].event_type, "milestone");
    assert.equal(rows[1].points_awarded, 50);
    assert.ok(calls.some((c) => c.table === "member_badges" && c.op === "upsert"));
  });

  it("race: the render that loses the claim awards nothing", async () => {
    const { client, calls, rpcs } = fakeSupabase((call) => {
      if (call.table === "members" && call.op === "select") return { data: member, error: null };
      // Another render already set last_active_date = today: zero rows match.
      if (call.table === "members" && call.op === "update") return { data: [], error: null };
      return { data: null, error: null };
    });
    const state = await touchStreak("m1", { admin: client, now: TODAY });
    assert.equal(state.pointsAwardedThisVisit, 0);
    assert.equal(state.isNewToday, false);
    assert.equal(calls.filter((c) => c.table === "points_ledger").length, 0);
    assert.equal(calls.filter((c) => c.table === "streak_log").length, 0);
    assert.equal(rpcs.length, 0);
  });

  it("retry: a duplicate ledger source_ref credits nothing and logs 0", async () => {
    const { client, calls, rpcs } = fakeSupabase((call) => {
      if (call.table === "members" && call.op === "select") return { data: member, error: null };
      if (call.table === "members" && call.op === "update") return { data: [{ id: "m1" }], error: null };
      if (call.table === "points_ledger") return { data: null, error: { code: "23505", message: "dup" } };
      return { data: null, error: null };
    });
    const state = await touchStreak("m1", { admin: client, now: TODAY });
    assert.equal(state.pointsAwardedThisVisit, 0);
    assert.equal(rpcs.length, 0, "totals never move without a ledger row");
    const log = calls.find((c) => c.table === "streak_log");
    const rows = log!.args[0] as Array<{ points_awarded: number }>;
    assert.deepEqual(rows.map((r) => r.points_awarded), [0, 0]);
  });

  it("same day is a pure read (members + checkins)", async () => {
    const { client, calls } = fakeSupabase((call) => {
      if (call.table === "checkins") return { data: [], error: null };
      return {
        data: { ...member, last_active_date: "2026-10-29", current_streak_days: 7, longest_streak_days: 7 },
        error: null,
      };
    });
    const state = await touchStreak("m1", { admin: client, now: TODAY });
    assert.equal(state.isNewToday, false);
    assert.equal(state.currentStreakDays, 7);
    assert.equal(state.visitStreakWeeks, 0);
    assert.deepEqual(calls.map((c) => c.table).sort(), ["checkins", "members"]);
  });

  it("source never writes total_points directly", () => {
    assert.doesNotMatch(touchSrc, /total_points/);
    assert.match(touchSrc, /awardPoints\(/);
  });
});

// TODAY (2026-10-29T15:00Z) is a Thursday, 11:00 ET. Week = Mon 10-26 .. Sun 11-01.
const checkinsAt = (...isos: string[]) => isos.map((iso) => ({ created_at: iso }));

describe("visit streak: week bucketing", () => {
  it("buckets on the ET calendar date, not UTC", () => {
    // 03:30Z on Monday 10-26 is still Sunday 10-25 evening in New York.
    assert.equal(visitDateET(new Date("2026-10-26T03:30:00Z")), "2026-10-25");
    assert.equal(weekIndexOf(new Date("2026-10-26T03:30:00Z")), weekIndexOfDate("2026-10-25"));
    assert.notEqual(weekIndexOfDate("2026-10-25"), weekIndexOfDate("2026-10-26"));
  });

  it("weeks run Monday through Sunday", () => {
    const mon = weekIndexOfDate("2026-10-26");
    assert.equal(weekIndexOfDate("2026-10-31"), mon, "Saturday is the same week");
    assert.equal(weekIndexOfDate("2026-11-01"), mon, "Sunday closes the week");
    assert.equal(weekIndexOfDate("2026-11-02"), mon + 1, "next Monday starts a new one");
    assert.equal(weekIndexOfDate("2026-10-25"), mon - 1);
    // Sanity anchors: 1970-01-01 (Thu) is week 0; Mon 1970-01-05 is week 1.
    assert.equal(weekIndexOfDate("1970-01-01"), 0);
    assert.equal(weekIndexOfDate("1970-01-04"), 0);
    assert.equal(weekIndexOfDate("1970-01-05"), 1);
  });
});

describe("visit streak: arithmetic", () => {
  it("no check-ins is a zero streak", () => {
    assert.deepEqual(computeVisitStreak([], TODAY), {
      currentWeeks: 0,
      longestWeeks: 0,
      visitedThisWeek: false,
    });
  });

  it("counts consecutive weeks; several visits in one week count once", () => {
    const s = computeVisitStreak(
      [
        "2026-10-27T23:00:00Z", // this week (Tue)
        "2026-10-20T23:00:00Z", // last week
        "2026-10-23T23:00:00Z", // last week again (same bucket)
        "2026-10-15T23:00:00Z", // two weeks back
      ],
      TODAY,
    );
    assert.equal(s.currentWeeks, 3);
    assert.equal(s.visitedThisWeek, true);
  });

  it("the open current week does not break the streak; a whole missed week does", () => {
    const lastWeekOnly = computeVisitStreak(
      ["2026-10-22T23:00:00Z", "2026-10-13T23:00:00Z"],
      TODAY,
    );
    assert.equal(lastWeekOnly.currentWeeks, 2, "visited last week, this week still open");
    assert.equal(lastWeekOnly.visitedThisWeek, false);

    const gap = computeVisitStreak(["2026-10-13T23:00:00Z", "2026-10-06T23:00:00Z"], TODAY);
    assert.equal(gap.currentWeeks, 0, "no visit this week or last: streak over");
    assert.equal(gap.longestWeeks, 2, "but the old run is remembered as longest");
  });

  it("a Sunday-night visit at 11:30pm ET stays in its week", () => {
    // 2026-11-02T04:30Z = Sunday 2026-11-01 23:30 ET → still this week.
    const s = computeVisitStreak(["2026-11-02T04:30:00Z"], new Date("2026-11-02T04:45:00Z"));
    assert.equal(s.currentWeeks, 1);
    assert.equal(s.visitedThisWeek, true);
  });

  it("longest run spans history and is never below the current run", () => {
    const s = computeVisitStreak(
      [
        "2026-10-28T12:00:00Z",
        // a 4-week run in the summer
        "2026-07-01T12:00:00Z",
        "2026-07-08T12:00:00Z",
        "2026-07-15T12:00:00Z",
        "2026-07-22T12:00:00Z",
      ],
      TODAY,
    );
    assert.equal(s.currentWeeks, 1);
    assert.equal(s.longestWeeks, 4);
  });

  it("milestones sit at 4 / 8 / 26 / 52 weeks", () => {
    assert.deepEqual(Object.keys(VISIT_MILESTONES).map(Number), [4, 8, 26, 52]);
    assert.equal(nextVisitMilestone(0), 4);
    assert.equal(nextVisitMilestone(3), 4);
    assert.equal(nextVisitMilestone(4), 8);
    assert.equal(nextVisitMilestone(30), 52);
    assert.equal(nextVisitMilestone(52), null);
    assert.equal(visitStreakMilestoneSourceRef("m1", 4), "visit-streak-milestone:m1:4");
  });
});

describe("touchStreak returns the visit streak", () => {
  const member = {
    id: "m1",
    current_streak_days: 2,
    longest_streak_days: 2,
    last_active_date: "2026-10-29", // login half is a no-op today
  };
  // Four consecutive weeks ending in the current one.
  const fourWeeks = checkinsAt(
    "2026-10-28T12:00:00Z",
    "2026-10-21T12:00:00Z",
    "2026-10-14T12:00:00Z",
    "2026-10-07T12:00:00Z",
  );

  it("reports weeks + next milestone and credits the 4-week bonus once", async () => {
    const { client, calls, rpcs } = fakeSupabase((call) => {
      if (call.table === "members") return { data: member, error: null };
      if (call.table === "checkins") return { data: fourWeeks, error: null };
      if (call.table === "member_community_memberships") return { data: [{ community_id: "nellies" }], error: null };
      return { data: null, error: null };
    });
    const state = await touchStreak("m1", { admin: client, now: TODAY });
    assert.equal(state.visitStreakWeeks, 4);
    assert.equal(state.longestVisitStreakWeeks, 4);
    assert.equal(state.nextVisitMilestone, 8);
    assert.equal(state.newVisitMilestone, 4);
    // Login half untouched: same day, no points.
    assert.equal(state.currentStreakDays, 2);
    assert.equal(state.pointsAwardedThisVisit, 0);

    const read = calls.find((c) => c.table === "checkins");
    assert.ok(read);
    assert.deepEqual(read.args, ["created_at"]);
    assert.ok(read.chain.includes("order") && read.chain.includes("limit"));

    const ledger = calls.filter((c) => c.table === "points_ledger");
    assert.deepEqual(ledger.map((c) => c.args[0]), [
      {
        member_id: "m1",
        delta: VISIT_MILESTONES[4],
        source: "daily_checkin",
        community_id: "nellies",
        source_ref: "visit-streak-milestone:m1:4",
        note: "4-week visit streak milestone",
      },
    ]);
    assert.deepEqual(rpcs.map((r) => (r.args as { p_delta: number }).p_delta), [100]);
    const log = calls.find((c) => c.table === "streak_log");
    assert.ok(log);
    const rows = log.args[0] as Array<{ event_type: string; metadata: { weeks: number } }>;
    assert.equal(rows[0].event_type, "milestone");
    assert.equal(rows[0].metadata.weeks, 4);
  });

  it("a repeat render in the milestone week is a no-op (duplicate source_ref)", async () => {
    const { client, calls, rpcs } = fakeSupabase((call) => {
      if (call.table === "members") return { data: member, error: null };
      if (call.table === "checkins") return { data: fourWeeks, error: null };
      if (call.table === "points_ledger") return { data: null, error: { code: "23505", message: "dup" } };
      return { data: null, error: null };
    });
    const state = await touchStreak("m1", { admin: client, now: TODAY });
    assert.equal(state.visitStreakWeeks, 4);
    assert.equal(state.newVisitMilestone, null);
    assert.equal(rpcs.length, 0);
    assert.equal(calls.filter((c) => c.table === "streak_log").length, 0);
  });

  it("off-milestone weeks award nothing", async () => {
    const { client, calls } = fakeSupabase((call) => {
      if (call.table === "members") return { data: member, error: null };
      if (call.table === "checkins") return { data: fourWeeks.slice(0, 3), error: null };
      return { data: null, error: null };
    });
    const state = await touchStreak("m1", { admin: client, now: TODAY });
    assert.equal(state.visitStreakWeeks, 3);
    assert.equal(state.nextVisitMilestone, 4);
    assert.equal(calls.filter((c) => c.table === "points_ledger").length, 0);
  });

  it("a checkins failure degrades to zero without touching the login half", async () => {
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      const { client } = fakeSupabase((call) => {
        if (call.table === "members") return { data: member, error: null };
        if (call.table === "checkins") return { data: null, error: { message: "boom" } };
        return { data: null, error: null };
      });
      const state = await touchStreak("m1", { admin: client, now: TODAY });
      assert.equal(state.visitStreakWeeks, 0);
      assert.equal(state.nextVisitMilestone, 4);
      assert.equal(state.currentStreakDays, 2);
    } finally {
      console.warn = origWarn;
    }
  });
});
