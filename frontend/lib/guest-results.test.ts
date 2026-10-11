import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RESULTS_MIN_REPEAT_GUESTS,
  RESULTS_MIN_VISITS,
  isRealGuestEmail,
  shouldShowGuestResults,
  summarizeGuestResults,
  type GuestVisitRow,
} from "./guest-results.ts";

const NOW = new Date("2026-10-11T12:00:00Z");

function visit(memberId: string, email: string | null, daysAgo: number): GuestVisitRow {
  return {
    member_id: memberId,
    email,
    created_at: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(),
  };
}

describe("isRealGuestEmail", () => {
  it("drops team, test and missing emails", () => {
    assert.equal(isRealGuestEmail("kevin@jonasgroup.com"), false);
    assert.equal(isRealGuestEmail("Someone@JonasGroup.com"), false);
    assert.equal(isRealGuestEmail("test@example.com"), false);
    assert.equal(isRealGuestEmail(null), false);
    assert.equal(isRealGuestEmail(""), false);
  });

  it("keeps real guests, including look-alike domains", () => {
    assert.equal(isRealGuestEmail("guest@gmail.com"), true);
    assert.equal(isRealGuestEmail("guest@notjonasgroup.com"), true);
  });
});

describe("summarizeGuestResults", () => {
  it("returns zeros for no rows", () => {
    assert.deepEqual(summarizeGuestResults([], NOW), {
      visits: 0,
      guests: 0,
      repeatGuests: 0,
      repeatRate: 0,
      visits30d: 0,
    });
  });

  it("counts visits, repeats, rate and the last 30 days", () => {
    const rows = [
      visit("a", "a@gmail.com", 1),
      visit("a", "a@gmail.com", 40),
      visit("b", "b@gmail.com", 2),
      visit("c", "c@gmail.com", 31),
      visit("c", "c@gmail.com", 45),
      visit("c", "c@gmail.com", 60),
      visit("d", "d@gmail.com", 5),
    ];
    assert.deepEqual(summarizeGuestResults(rows, NOW), {
      visits: 7,
      guests: 4,
      repeatGuests: 2,
      repeatRate: 0.5,
      visits30d: 3,
    });
  });

  it("leaves out team and test accounts", () => {
    const rows = [
      visit("t", "kevin@jonasgroup.com", 1),
      visit("t", "kevin@jonasgroup.com", 2),
      visit("x", "test@example.com", 1),
      visit("g", "g@gmail.com", 1),
    ];
    const s = summarizeGuestResults(rows, NOW);
    assert.equal(s.visits, 1);
    assert.equal(s.guests, 1);
    assert.equal(s.repeatGuests, 0);
  });

  it("does not change the input", () => {
    const rows = [visit("a", "a@gmail.com", 1)];
    const copy = structuredClone(rows);
    summarizeGuestResults(rows, NOW);
    assert.deepEqual(rows, copy);
  });
});

describe("shouldShowGuestResults", () => {
  const base = { guests: 0, repeatRate: 0, visits30d: 0 };

  it("uses 50 visits and 10 repeat guests", () => {
    assert.equal(RESULTS_MIN_VISITS, 50);
    assert.equal(RESULTS_MIN_REPEAT_GUESTS, 10);
  });

  it("stays hidden below either minimum", () => {
    assert.equal(shouldShowGuestResults(null), false);
    assert.equal(shouldShowGuestResults({ ...base, visits: 49, repeatGuests: 10 }), false);
    assert.equal(shouldShowGuestResults({ ...base, visits: 500, repeatGuests: 9 }), false);
  });

  it("shows once both minimums are met", () => {
    assert.equal(shouldShowGuestResults({ ...base, visits: 50, repeatGuests: 10 }), true);
  });
});
