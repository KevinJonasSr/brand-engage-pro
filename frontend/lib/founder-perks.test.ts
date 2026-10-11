import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  FOUNDER_EARLY_RSVP_HOURS,
  FOUNDER_LEDGER_LABEL,
  canRsvpNow,
  formatCountdown,
  isFoundersWindowError,
  ledgerNote,
  msUntilOpen,
  parseEarlyRsvpHours,
  pointsMultiplier,
  publicRsvpOpensAt,
  resolveEarlyRsvpHours,
  scaledPoints,
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

  it("stays at 1.5x for a founder on premium", () => {
    assert.equal(pointsMultiplier({ isPremium: true, isFounder: true }), 1.5);
  });
});

describe("scaledPoints / ledgerNote", () => {
  it("rounds a 25-point check-in at 1.5x to 38", () => {
    assert.equal(scaledPoints(25, 1.5), 38);
    assert.equal(scaledPoints(25, 1), 25);
  });

  it("labels a founder Founder 1.5x and does not call it premium", () => {
    assert.equal(
      ledgerNote("Visit check-in at nellies", { isFounder: true, isPremium: true }),
      `Visit check-in at nellies (${FOUNDER_LEDGER_LABEL})`,
    );
    assert.equal(FOUNDER_LEDGER_LABEL, "Founder 1.5x");
  });

  it("keeps the premium label for a non-founder", () => {
    assert.equal(
      ledgerNote("Poll vote", { isFounder: false, isPremium: true }),
      "Poll vote (premium 1.5×)",
    );
    assert.equal(
      ledgerNote("Poll vote", { isFounder: false, isPremium: false }),
      "Poll vote",
    );
  });
});

describe("early RSVP hours", () => {
  it("defaults new events to 24 hours and can turn the window off", () => {
    assert.equal(FOUNDER_EARLY_RSVP_HOURS, 24);
    const opens = publicRsvpOpensAt(NOW);
    assert.ok(opens);
    assert.equal(opens.toISOString(), hoursFromNow(24));
    assert.equal(publicRsvpOpensAt(NOW, 0), null);
    const fourHours = publicRsvpOpensAt(NOW, 4);
    assert.ok(fourHours);
    assert.equal(fourHours.toISOString(), hoursFromNow(4));
  });

  it("lets a per-event number override the brand, including 0", () => {
    assert.equal(resolveEarlyRsvpHours(null, 24), 24);
    assert.equal(resolveEarlyRsvpHours(undefined, null), 24);
    assert.equal(resolveEarlyRsvpHours(0, 24), 0);
    assert.equal(resolveEarlyRsvpHours(6, 24), 6);
  });

  it("parses a blank as inherit and rejects junk", () => {
    assert.equal(parseEarlyRsvpHours(""), null);
    assert.equal(parseEarlyRsvpHours("  "), null);
    assert.equal(parseEarlyRsvpHours("0"), 0);
    assert.equal(parseEarlyRsvpHours("24"), 24);
    assert.equal(parseEarlyRsvpHours("168"), 168);
    assert.equal(parseEarlyRsvpHours("169"), "invalid");
    assert.equal(parseEarlyRsvpHours("-1"), "invalid");
    assert.equal(parseEarlyRsvpHours("1.5"), "invalid");
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

describe("founder SQL", () => {
  const windowSql = readFileSync(
    fileURLToPath(new URL("../../supabase/migrations/0076_founder_early_rsvp_window.sql", import.meta.url)),
    "utf8",
  );
  const pointsSql = readFileSync(
    fileURLToPath(new URL("../../supabase/migrations/0077_founder_points_flat.sql", import.meta.url)),
    "utf8",
  );
  const checkins = readFileSync(
    fileURLToPath(new URL("./data/checkins.ts", import.meta.url)),
    "utf8",
  );

  it("does not rewrite existing event open times", () => {
    assert.match(windowSql, /founder_early_rsvp_hours is not distinct from old.founder_early_rsvp_hours/);
    assert.match(windowSql, /return new;/);
    assert.doesNotMatch(windowSql, /update public\.brand_events/i);
    assert.match(windowSql, /default 24/);
  });

  it("gives founders a flat 1.5x labeled Founder 1.5x", () => {
    assert.match(pointsSql, /when public\.is_founder\(p_member_id, p_community_id\) then 1\.5/);
    assert.doesNotMatch(pointsSql, /\+ case when/);
    assert.match(pointsSql, /Founder 1\.5x/);
    assert.doesNotMatch(pointsSql, /award_nellies_three_visit_bonus/);
    assert.doesNotMatch(pointsSql, /1500/);
  });

  it("applies the same multiplier to QR check-in points", () => {
    assert.match(checkins, /pointsMultiplier/);
    assert.match(checkins, /ledgerNote/);
    assert.match(checkins, /scaledPoints/);
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
