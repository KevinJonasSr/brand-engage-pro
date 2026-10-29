import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeTodayHours,
  googleMapsSearchUrl,
  hasAnyHours,
  localDayAndMinutes,
  rangesForDay,
  telHref,
} from "./brand-hours.ts";

// 2026-10-28 is a Wednesday. New York is on EDT (UTC-4) that week, so
// 18:00Z == 14:00 local and 05:00Z == 01:00 local.
const WED_2PM_NY = new Date("2026-10-28T18:00:00Z");
const WED_1AM_NY = new Date("2026-10-28T05:00:00Z");
const WED_1130PM_NY = new Date("2026-10-29T03:30:00Z");

const WEEK = {
  mon: [{ open: "11:00", close: "22:00" }],
  tue: [{ open: "11:00", close: "22:00" }],
  wed: [{ open: "11:00", close: "22:00" }],
  thu: [{ open: "11:00", close: "22:00" }],
  fri: [{ open: "11:00", close: "23:00" }],
  sat: [{ open: "10:00", close: "23:00" }],
  sun: [] as { open: string; close: string }[],
};

describe("localDayAndMinutes", () => {
  it("resolves the weekday and clock in America/New_York, not UTC", () => {
    // 03:30Z Thursday is still 23:30 Wednesday in New York.
    assert.deepEqual(localDayAndMinutes(WED_1130PM_NY), { day: "wed", minutes: 23 * 60 + 30 });
    assert.deepEqual(localDayAndMinutes(WED_2PM_NY), { day: "wed", minutes: 14 * 60 });
  });
});

describe("describeTodayHours", () => {
  it("renders today's range and reports open-now inside it", () => {
    const r = describeTodayHours(WEEK, WED_2PM_NY);
    assert.equal(r.status, "open");
    assert.equal(r.label, "Open today 11:00–22:00");
    assert.equal(r.openNow, true);
  });

  it("still says 'Open today …' before opening, with openNow false", () => {
    const r = describeTodayHours(WEEK, WED_1AM_NY);
    assert.equal(r.label, "Open today 11:00–22:00");
    assert.equal(r.openNow, false);
  });

  it("says Closed today when the day has no ranges", () => {
    const sunday = new Date("2026-10-25T18:00:00Z");
    const r = describeTodayHours(WEEK, sunday);
    assert.equal(r.status, "closed");
    assert.equal(r.label, "Closed today");
    assert.equal(r.openNow, false);
  });

  it("joins split shifts with a dot", () => {
    const split = { wed: [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "22:00" }] };
    const r = describeTodayHours(split, WED_2PM_NY);
    assert.equal(r.label, "Open today 11:00–14:00 · 17:00–22:00");
    assert.equal(r.openNow, false); // 14:00 is the close boundary
  });

  it("handles overnight ranges (close <= open) across midnight", () => {
    const bar = { tue: [{ open: "17:00", close: "02:00" }] };
    // 01:00 Wednesday: Tuesday's shift is still running → openNow, but
    // Wednesday itself has no hours, so the label is Closed today.
    const late = describeTodayHours(bar, WED_1AM_NY);
    assert.equal(late.status, "closed");
    assert.equal(late.label, "Closed today");
    assert.equal(late.openNow, true);
    // 23:30 Tuesday: inside the overnight range on its own day.
    const tueLate = describeTodayHours(bar, new Date("2026-10-28T03:30:00Z"));
    assert.equal(tueLate.label, "Open today 17:00–02:00");
    assert.equal(tueLate.openNow, true);
  });

  it("returns unknown for missing, empty, or malformed hours", () => {
    for (const bad of [null, undefined, {}, { mon: [] }, { mon: null }, "11-10", 42, { mon: [{ open: "lunch", close: "late" }] }]) {
      const r = describeTodayHours(bad, WED_2PM_NY);
      assert.equal(r.status, "unknown", JSON.stringify(bad));
      assert.equal(r.label, null);
      assert.equal(r.openNow, false);
    }
  });

  it("ignores malformed ranges but keeps valid siblings", () => {
    const mixed = { wed: [{ open: "11:00" }, { open: "9:30", close: "22:00" }] };
    assert.equal(rangesForDay(mixed, "wed").length, 1);
    assert.equal(describeTodayHours(mixed, WED_2PM_NY).label, "Open today 09:30–22:00");
  });

  it("hasAnyHours reflects whether any day has a usable range", () => {
    assert.equal(hasAnyHours(WEEK), true);
    assert.equal(hasAnyHours({ sun: [] }), false);
  });
});

describe("links", () => {
  it("builds a Google Maps search URL from the address", () => {
    assert.equal(
      googleMapsSearchUrl("36 N Main St, Belmont, NC 28012"),
      "https://www.google.com/maps/search/?api=1&query=36%20N%20Main%20St%2C%20Belmont%2C%20NC%2028012",
    );
  });

  it("builds a tel: href keeping digits and a leading plus", () => {
    assert.equal(telHref("(704) 825-1122"), "tel:7048251122");
    assert.equal(telHref("+1 704-825-1122"), "tel:+17048251122");
  });
});
