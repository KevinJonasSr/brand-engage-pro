import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FOUNDER_EARLY_RSVP_HOURS,
  canRsvpNow,
  formatCountdown,
  isFoundersWindowError,
  msUntilOpen,
  pointsMultiplier,
  publicRsvpOpensAt,
} from "./founder-perks.ts";

const NOW = new Date("2026-10-11T12:00:00.000Z");
const hoursFromNow = (n: number) => new Date(NOW.getTime() + n * 3600000).toISOString();

describe("pointsMultiplier", () => {
  it("is 1x for a regular member", () => {
    assert.equal(pointsMultiplier({ isPremium: false, isFounder: false }), 1);
  });

  it("is 1.5x for a founder or a premium member", () => {
    assert.equal(pointsMultiplier({ isPremium: false, isFounder: true }), 1.5);
    assert.equal(pointsMultiplier({ isPremium: true, isFounder: false }), 1.5);
  });

  it("stacks to 2x for a founder on premium", () => {
    assert.equal(pointsMultiplier({ isPremium: true, isFounder: true }), 2);
  });
});

describe("publicRsvpOpensAt", () => {
  it("opens to everyone 48 hours after the event is created", () => {
    assert.equal(FOUNDER_EARLY_RSVP_HOURS, 48);
    assert.equal(publicRsvpOpensAt(NOW).toISOString(), hoursFromNow(48));
  });
});

describe("canRsvpNow", () => {
  it("always lets founders RSVP", () => {
    assert.equal(canRsvpNow({ isFounder: true, opensAt: hoursFromNow(10), now: NOW }), true);
  });

  it("holds non-founders until RSVPs open", () => {
    assert.equal(canRsvpNow({ isFounder: false, opensAt: hoursFromNow(10), now: NOW }), false);
  });

  it("lets everyone in once open", () => {
    assert.equal(canRsvpNow({ isFounder: false, opensAt: hoursFromNow(0), now: NOW }), true);
    assert.equal(canRsvpNow({ isFounder: false, opensAt: hoursFromNow(-1), now: NOW }), true);
  });

  it("treats a missing or bad open time as already open", () => {
    assert.equal(canRsvpNow({ isFounder: false, opensAt: null, now: NOW }), true);
    assert.equal(canRsvpNow({ isFounder: false, opensAt: "not a date", now: NOW }), true);
  });
});

describe("msUntilOpen / formatCountdown", () => {
  it("counts down to the open time and stops at zero", () => {
    assert.equal(msUntilOpen(hoursFromNow(2), NOW), 2 * 3600000);
    assert.equal(msUntilOpen(hoursFromNow(-2), NOW), 0);
    assert.equal(msUntilOpen(null, NOW), 0);
  });

  it("formats days, hours and minutes", () => {
    assert.equal(formatCountdown(28 * 3600000), "1d 4h");
    assert.equal(formatCountdown(3 * 3600000 + 12 * 60000), "3h 12m");
    assert.equal(formatCountdown(45 * 60000), "45m");
  });

  it("rounds up so it never shows 0m while still closed", () => {
    assert.equal(formatCountdown(5000), "1m");
  });
});

describe("isFoundersWindowError", () => {
  it("spots the trigger error", () => {
    assert.equal(isFoundersWindowError("Founders RSVP first"), true);
    assert.equal(isFoundersWindowError("P0001: Founders RSVP first until 2026-10-13"), true);
    assert.equal(isFoundersWindowError("Event is at capacity"), false);
    assert.equal(isFoundersWindowError(null), false);
  });
});
