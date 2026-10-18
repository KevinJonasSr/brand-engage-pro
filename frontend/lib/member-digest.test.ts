import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDigestContent,
  digestHasWeeklyActions,
  parseTestEmailParam,
  streakIsCurrent,
} from "./member-digest.ts";

const empty = {
  pointsEarned: 0,
  rsvpsAdded: 0,
  commentsAdded: 0,
  reactionsGiven: 0,
  topBrandName: null,
};

describe("digestHasWeeklyActions", () => {
  it("ignores a stored streak and requires a weekly counter", () => {
    assert.equal(digestHasWeeklyActions(empty), false);
    assert.equal(digestHasWeeklyActions({ ...empty, pointsEarned: 5 }), true);
    assert.equal(digestHasWeeklyActions({ ...empty, commentsAdded: 1 }), true);
  });
});

describe("streakIsCurrent", () => {
  const now = new Date("2026-10-18T16:00:00.000Z");

  it("accepts a visit inside the week and rejects a frozen streak", () => {
    assert.equal(streakIsCurrent("2026-10-17", now), true);
    assert.equal(streakIsCurrent("2026-08-01", now), false);
    assert.equal(streakIsCurrent(null, now), false);
  });
});

describe("parseTestEmailParam", () => {
  it("accepts one address and rejects a list", () => {
    assert.equal(parseTestEmailParam(null), null);
    assert.equal(parseTestEmailParam("  "), null);
    assert.equal(parseTestEmailParam(" A@Example.com "), "a@example.com");
    assert.equal(parseTestEmailParam("a@example.com,b@example.com"), "invalid");
    assert.equal(parseTestEmailParam("not-an-email"), "invalid");
  });
});

describe("buildDigestContent", () => {
  it("includes the address, reply path, and a current streak", () => {
    const mail = buildDigestContent({
      firstName: "Sam",
      recap: { ...empty, pointsEarned: 12, topBrandName: "Nellie's" },
      streakDays: 4,
      postalAddress: "1 Main St, Nashville, TN 37201",
      unsubscribeHref: "https://www.brandengagepro.com/unsubscribe?token=abc&channel=email",
      homeHref: "https://www.brandengagepro.com",
      lastActiveDate: "2026-10-17",
      now: new Date("2026-10-18T16:00:00.000Z"),
    });
    assert.match(mail.subject, /Your week at Nellie's/);
    assert.match(mail.html, /1 Main St, Nashville, TN 37201/);
    assert.match(mail.html, /mc:disable-tracking/);
    assert.match(mail.html, /token=abc/);
    assert.match(mail.html, /4-day/);
    assert.match(mail.text, /Unsubscribe: https:\/\/www\.brandengagepro\.com\/unsubscribe/);
    assert.match(mail.text, /1 Main St, Nashville, TN 37201/);
    assert.equal(mail.text.includes("sam@"), false);
  });

  it("does not quote a stale streak", () => {
    const mail = buildDigestContent({
      firstName: "Sam",
      recap: { ...empty, reactionsGiven: 2, topBrandName: "Nellie's" },
      streakDays: 40,
      postalAddress: "1 Main St",
      unsubscribeHref: "https://www.brandengagepro.com/unsubscribe?token=abc&channel=email",
      homeHref: "https://www.brandengagepro.com",
      lastActiveDate: "2026-08-01",
      now: new Date("2026-10-18T16:00:00.000Z"),
    });
    assert.equal(mail.html.includes("40-day"), false);
    assert.equal(mail.text.includes("40-day"), false);
    assert.match(mail.html, /reactions given/);
  });
});
