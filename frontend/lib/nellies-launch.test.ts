import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  NELLIES_BOURBON_CAPACITY,
  NELLIES_BOURBON_DETAIL,
  NELLIES_BOURBON_LOCATION,
  NELLIES_BOURBON_STARTS_AT,
  NELLIES_BOURBON_WHEN,
  NELLIES_HIDDEN_TITLES,
  NELLIES_PUBLISHED_OFFER_SLUGS,
  NELLIES_PUBLISHED_OFFER_TITLES,
  applyNelliesLaunchEvents,
  applyNelliesLaunchOffers,
  applyNelliesLaunchSpecials,
  filterNelliesLaunchLatestCards,
  filterNelliesLaunchRewards,
  isBirthdayRedemptionOpen,
  isNelliesHiddenTitle,
  isNelliesPublishedOfferTitle,
  jackieLaunchSpecials,
  shouldAwardThreeVisitBonus,
  stripRooftop,
} from "./nellies-launch.ts";

describe("Nellie's Jackie launch fixture", () => {
  it("publishes Jackie’s three titles/slugs and not merch SKUs", () => {
    assert.deepEqual(NELLIES_PUBLISHED_OFFER_TITLES, [
      "Free Dessert w/ Entree",
      "1,500 Bonus Points",
      "Birthday Entree up to $30",
    ]);
    assert.deepEqual(NELLIES_PUBLISHED_OFFER_SLUGS, [
      "nsk-free-dessert",
      "nsk-3-visit-bonus",
      "nsk-birthday-entree",
    ]);
    for (const title of NELLIES_PUBLISHED_OFFER_TITLES) {
      assert.equal(isNelliesPublishedOfferTitle(title), true);
      assert.equal(isNelliesHiddenTitle(title), false);
    }
  });

  it("hides extras, 1500/2200 merch, LIVEBOOTH, and duplicates", () => {
    const hidden = [
      ...NELLIES_HIDDEN_TITLES,
      "Reserved Booth on Live Music Nights",
      "House Hot Sauce 3-Pack",
      "Live Music — Rooftop (Thursday)",
      "Live Music — Rooftop (Friday)",
      "Del Webb Rooftop Happy Hour",
      "The Memorabilia Hallway Tour",
      "Rooftop Karaoke Night",
    ];
    for (const title of hidden) {
      assert.equal(isNelliesHiddenTitle(title), true, title);
    }
    assert.equal(isNelliesHiddenTitle("Bourbon & Cigar Night"), false);
  });

  it("injects Jackie’s three onto the brand-page specials surface", () => {
    const shown = applyNelliesLaunchSpecials("nellies", [
      {
        id: "x",
        title: "2-for-1 Fried Chicken Tuesdays",
        points_required: 1,
      },
    ]);
    assert.equal(shown.length, 3);
    assert.deepEqual(
      shown.map((s) => s.title),
      [...NELLIES_PUBLISHED_OFFER_TITLES],
    );
    assert.ok(shown.every((s) => s.points_required == null));
    assert.ok(
      shown.every((s) => ("tier" in s ? s.tier === "public" : false)),
    );
  });

  it("does not leave Hallway / LIVEBOOTH as signed-out premium teasers", () => {
    const shown = applyNelliesLaunchSpecials("nellies", [
      {
        id: "hallway",
        title: "The Memorabilia Hallway Tour",
        tier: "founder-only",
        points_required: null,
      },
      {
        id: "booth",
        title: "Reserved Booth on Live Music Nights",
        tier: "premium",
        redemption_code: "LIVEBOOTH",
        points_required: null,
      },
    ]);
    assert.deepEqual(
      shown.map((s) => s.title),
      [...NELLIES_PUBLISHED_OFFER_TITLES],
    );
    assert.equal(
      shown.some((s) => /hallway|reserved booth|livebooth/i.test(s.title)),
      false,
    );
    assert.ok(shown.every((s) => s.tier === "public"));
  });

  it("does not publish Jackie’s three as catalog/marketplace SKUs", () => {
    const offers = applyNelliesLaunchOffers("nellies", [
      { title: "Free Dessert w/ Entree", slug: "nsk-free-dessert", point_cost: 1 },
      { title: "House Hot Sauce 3-Pack", slug: "hot-sauce", point_cost: 2200 },
    ]);
    assert.deepEqual(offers, []);
    assert.deepEqual(
      filterNelliesLaunchRewards("nellies", [
        { title: "Nellie's Apron + Recipe Card" },
        { title: "1,500 Bonus Points" },
      ]),
      [],
    );
  });

  it("awards 1,500 pts on the 3rd check-in only, once", () => {
    assert.equal(shouldAwardThreeVisitBonus(2, false), false);
    assert.equal(shouldAwardThreeVisitBonus(3, false), true);
    assert.equal(shouldAwardThreeVisitBonus(4, true), false);
  });

  it("opens birthday entrée only in the stored birthday month", () => {
    const sept = new Date("2026-09-15T16:00:00.000Z");
    assert.equal(isBirthdayRedemptionOpen(9, sept), true);
    assert.equal(isBirthdayRedemptionOpen(8, sept), false);
    assert.equal(isBirthdayRedemptionOpen(null, sept), false);
  });
});

describe("Bourbon & Cigar Night", () => {
  it("uses Private Dining Room, Sept 23 7:00pm ET, cap 40, no Rooftop", () => {
    assert.match(NELLIES_BOURBON_LOCATION, /Private Dining Room/);
    assert.doesNotMatch(NELLIES_BOURBON_LOCATION, /rooftop/i);
    assert.doesNotMatch(NELLIES_BOURBON_DETAIL, /rooftop/i);
    assert.match(NELLIES_BOURBON_WHEN, /September 23/);
    assert.match(NELLIES_BOURBON_WHEN, /7:00 PM ET/);
    assert.equal(NELLIES_BOURBON_CAPACITY, 40);
    assert.equal(NELLIES_BOURBON_STARTS_AT, "2026-09-23T23:00:00.000Z");
    assert.equal(stripRooftop("On the Rooftop bar"), "On the bar");
  });

  it("shapes Nellie upcoming to a single Bourbon event with date + PDR", () => {
    const events = applyNelliesLaunchEvents("nellies", [
      {
        id: "11111111-1111-1111-1111-111111111111",
        title: "Bourbon & Cigar Night",
        detail: "Rooftop tasting",
        event_date: null,
        location: "Rooftop",
        active: true,
      },
      {
        id: "2",
        title: "Happy Hour — 50% Off Appetizers",
        active: true,
      },
    ]);
    assert.equal(events.length, 1);
    assert.equal(events[0].title, "Bourbon & Cigar Night");
    assert.equal(events[0].date, NELLIES_BOURBON_WHEN);
    assert.equal(events[0].location, NELLIES_BOURBON_LOCATION);
    assert.equal(events[0].capacity, 40);
    assert.doesNotMatch(events[0].detail, /rooftop/i);
    assert.doesNotMatch(events[0].location, /rooftop/i);
    assert.equal(events[0].startsAt, NELLIES_BOURBON_STARTS_AT);
  });

  it("forces event_date + event_starts_at even when live DB has a relative starts_at", () => {
    const events = applyNelliesLaunchEvents("nellies", [
      {
        id: "11111111-1111-1111-1111-111111111111",
        title: "Bourbon & Cigar Night",
        detail: "On the Rooftop",
        event_date: null,
        event_starts_at: null,
        starts_at: "2026-08-27T23:00:00.000Z",
        location: "Nellie's Southern Kitchen — Rooftop",
        capacity: 40,
        active: true,
      },
    ]);
    assert.equal(events[0].date, NELLIES_BOURBON_WHEN);
    assert.equal(events[0].startsAt, NELLIES_BOURBON_STARTS_AT);
    assert.match(events[0].date, /September 23/);
    assert.match(events[0].date, /7:00 PM ET/);
    assert.doesNotMatch(events[0].detail, /rooftop/i);
    assert.doesNotMatch(events[0].location, /rooftop/i);
  });

  it("drops rooftop extras from the signed-out Latest strip", () => {
    const cards = filterNelliesLaunchLatestCards("nellies", [
      {
        kind: "event",
        title: "Del Webb Rooftop Happy Hour",
        when: "in 3d",
        ts: "2026-09-01T20:00:00.000Z",
      },
      {
        kind: "event",
        title: "Live Music — Rooftop (Thursday)",
        when: "in 4d",
        ts: "2026-09-17T23:00:00.000Z",
      },
      {
        kind: "event",
        title: "Live Music — Rooftop (Friday)",
        when: "in 5d",
        ts: "2026-09-18T23:00:00.000Z",
      },
      {
        kind: "event",
        title: "Bourbon & Cigar Night",
        when: "",
        ts: "2026-08-27T23:00:00.000Z",
        body: "Tasting on the Rooftop",
      },
    ]);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].title, "Bourbon & Cigar Night");
    assert.equal(cards[0].when, NELLIES_BOURBON_WHEN);
    assert.equal(cards[0].ts, NELLIES_BOURBON_STARTS_AT);
    assert.doesNotMatch(cards[0].body ?? "", /rooftop/i);
  });
});

describe("guest surfaces", () => {
  it("keeps Jackie specials as non-SKU info cards", () => {
    const specials = jackieLaunchSpecials();
    assert.equal(specials.length, 3);
    assert.ok(specials.every((s) => s.points_required === null));
  });

  it("ships a real /events page (not a 404) with Jackie + Bourbon", () => {
    const eventsPage = readFileSync(
      fileURLToPath(new URL("../app/events/page.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(eventsPage, /NELLIES_PUBLISHED_OFFERS/);
    assert.match(eventsPage, /Bourbon & Cigar Night/);
    assert.match(eventsPage, /September 23/);
    assert.match(eventsPage, /NELLIES_BOURBON_LOCATION|Private Dining Room/);
    assert.match(eventsPage, /NELLIES_BOURBON_WHEN|7:00 PM ET/);
    assert.doesNotMatch(eventsPage, /Rooftop/);
  });

  it("hardcodes Nellie fallback without apron/hot sauce merch", () => {
    const brands = readFileSync(
      fileURLToPath(new URL("./brands.ts", import.meta.url)),
      "utf8",
    );
    const nellies = brands.slice(brands.indexOf("nellies:"));
    const block = nellies.slice(0, nellies.indexOf("raelynn:"));
    assert.match(block, /Bourbon & Cigar Night/);
    assert.match(block, /Private Dining Room/);
    assert.match(block, /September 23/);
    assert.doesNotMatch(block, /Apron/);
    assert.doesNotMatch(block, /Hot Sauce/);
    assert.doesNotMatch(block, /Rooftop/);
  });
});
