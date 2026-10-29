import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { fakeSupabase } from "../points/fake-supabase.test-helper.ts";
import {
  MILESTONES,
  STREAK_LEDGER_SOURCE,
  computeStreakTransition,
  dailyBonusForStreak,
  daysToNextMilestone,
  streakMilestoneSourceRef,
  streakSourceRef,
  touchStreak,
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

  it("same day is a pure read", async () => {
    const { client, calls } = fakeSupabase(() => ({
      data: { ...member, last_active_date: "2026-10-29", current_streak_days: 7, longest_streak_days: 7 },
      error: null,
    }));
    const state = await touchStreak("m1", { admin: client, now: TODAY });
    assert.equal(state.isNewToday, false);
    assert.equal(state.currentStreakDays, 7);
    assert.equal(calls.length, 1);
  });

  it("source never writes total_points directly", () => {
    assert.doesNotMatch(touchSrc, /total_points/);
    assert.match(touchSrc, /awardPoints\(/);
  });
});
