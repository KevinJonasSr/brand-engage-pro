import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkinDetails,
  checkinHeadline,
  stampBarPercent,
  type CheckinProgress,
} from "../../components/checkin-progress-copy.ts";

const base: CheckinProgress = {
  spendablePoints: 1250,
  visitCount: 3,
  streakDays: 4,
  stampCard: {
    stampsEarned: 3,
    stampsRequired: 5,
    rewardTitle: "Free entrée",
    visitsRemaining: 2,
    justCompleted: false,
  },
  nextTier: { name: "Silver", pointsToNext: 400 },
};

describe("checkinHeadline", () => {
  it("joins points, stamps and visits remaining", () => {
    assert.equal(
      checkinHeadline(25, base),
      "+25 pts · 3 of 5 stamps · 2 more visits to your Free entrée",
    );
  });

  it("singularises one remaining visit", () => {
    const p = { ...base, stampCard: { ...base.stampCard!, stampsEarned: 4, visitsRemaining: 1 } };
    assert.equal(checkinHeadline(25, p), "+25 pts · 4 of 5 stamps · 1 more visit to your Free entrée");
  });

  it("celebrates a completed card", () => {
    const p = {
      ...base,
      stampCard: { ...base.stampCard!, stampsEarned: 0, visitsRemaining: 0, justCompleted: true },
    };
    assert.equal(checkinHeadline(25, p), "+25 pts · 5 of 5 stamps · Free entrée unlocked");
  });

  it("falls back to the visit count without a stamp card", () => {
    assert.equal(checkinHeadline(25, { ...base, stampCard: null }), "+25 pts · 3 visits here");
    assert.equal(
      checkinHeadline(25, { ...base, stampCard: null, visitCount: 1 }),
      "+25 pts · 1 visit here",
    );
  });

  it("omits the points segment on an already-checked-in day", () => {
    assert.equal(checkinHeadline(0, base), "3 of 5 stamps · 2 more visits to your Free entrée");
  });

  it("survives a missing progress snapshot", () => {
    assert.equal(checkinHeadline(25, null), "+25 pts");
    assert.equal(checkinHeadline(0, null), "");
  });
});

describe("checkinDetails", () => {
  it("lists balance, streak, visits and next tier", () => {
    assert.deepEqual(checkinDetails(base), [
      "1,250 pts to spend",
      "4 day streak",
      "3 visits here",
      "400 pts to Silver",
    ]);
  });

  it("hides a one-day streak and a topped-out ladder", () => {
    assert.deepEqual(
      checkinDetails({ ...base, streakDays: 1, nextTier: null, stampCard: null }),
      ["1,250 pts to spend"],
    );
  });

  it("returns nothing without progress", () => {
    assert.deepEqual(checkinDetails(null), []);
  });
});

describe("stampBarPercent", () => {
  it("fills proportionally and caps at 100", () => {
    assert.equal(stampBarPercent(base.stampCard), 60);
    assert.equal(stampBarPercent({ ...base.stampCard!, justCompleted: true, stampsEarned: 0 }), 100);
    assert.equal(stampBarPercent({ ...base.stampCard!, stampsEarned: 9 }), 100);
  });

  it("is null without a card", () => {
    assert.equal(stampBarPercent(null), null);
  });
});
