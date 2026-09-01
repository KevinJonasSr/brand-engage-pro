import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  NELLIES_BOURBON_CAPACITY,
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
  resolveBourbonGuestCopy,
  shouldAwardThreeVisitBonus,
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

  it("does not rewrite JGE Music Row House Tour", () => {
    const rows = [{ id: "jge-1", title: "Music Row House Tour" }];
    assert.deepEqual(applyNelliesLaunchSpecials("jonas-group-ent", rows), rows);
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
  it("stamps PDR, Sept 23 7:00pm ET, cap 40, and strips Rooftop from detail", () => {
    assert.match(NELLIES_BOURBON_LOCATION, /Private Dining Room/);
    assert.doesNotMatch(NELLIES_BOURBON_LOCATION, /rooftop/i);
    assert.match(NELLIES_BOURBON_WHEN, /September 23/);
    assert.match(NELLIES_BOURBON_WHEN, /7:00 PM ET/);
    assert.equal(NELLIES_BOURBON_CAPACITY, 40);
    assert.equal(NELLIES_BOURBON_STARTS_AT, "2026-09-23T23:00:00.000Z");
  });

  it("forces Private Dining Room even when the row says Rooftop", () => {
    const copy = resolveBourbonGuestCopy({
      location: "Nellie's Southern Kitchen — Rooftop",
      detail:
        "An exclusive evening of premium bourbon pours and hand-selected cigars on the Rooftop. Capacity limited to 40 guests.",
      capacity: 40,
    });
    assert.equal(copy.location, NELLIES_BOURBON_LOCATION);
    assert.doesNotMatch(copy.detail, /rooftop/i);
    assert.equal(copy.capacity, 40);
  });

  it("strips Platinum / Gold / priority / waitlist from Bourbon detail", () => {
    const copy = resolveBourbonGuestCopy({
      location: "Nellie's Southern Kitchen — Private Dining Room",
      detail:
        "Platinum members receive priority seating; Gold members may request the waitlist. Members welcome.",
      capacity: 40,
    });
    assert.doesNotMatch(copy.detail, /platinum/i);
    assert.doesNotMatch(copy.detail, /gold members/i);
    assert.doesNotMatch(copy.detail, /priority seating/i);
    assert.doesNotMatch(copy.detail, /waitlist/i);
    assert.match(copy.detail, /Members welcome/i);
    assert.equal(copy.location, NELLIES_BOURBON_LOCATION);
    assert.equal(copy.capacity, 40);
  });

  it("strips 0048 invite-only Platinum / Gold waitlist copy", () => {
    const copy = resolveBourbonGuestCopy({
      detail:
        "An exclusive evening of premium bourbon pours and hand-selected cigars. Invite-only for Platinum members; Gold members may request waitlist access. Earn the Bourbon Enthusiast badge.",
    });
    assert.doesNotMatch(copy.detail, /platinum/i);
    assert.doesNotMatch(copy.detail, /gold members/i);
    assert.doesNotMatch(copy.detail, /waitlist/i);
    assert.doesNotMatch(copy.detail, /invite-only/i);
  });

  it("stamps PDR when the row has no location", () => {
    const copy = resolveBourbonGuestCopy({
      location: null,
      detail: "Members welcome.",
    });
    assert.equal(copy.location, NELLIES_BOURBON_LOCATION);
    assert.equal(copy.capacity, 40);
  });

  it("shapes Nellie upcoming to Bourbon with PDR, date, and cap 40", () => {
    const events = applyNelliesLaunchEvents("nellies", [
      {
        id: "11111111-1111-1111-1111-111111111111",
        title: "Bourbon & Cigar Night",
        detail: "Hand-selected cigars on the Rooftop.",
        event_date: null,
        location: "Nellie's Southern Kitchen — Rooftop",
        capacity: null,
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
        location: "Nellie's Southern Kitchen — Rooftop",
      },
    ]);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].title, "Bourbon & Cigar Night");
    assert.equal(cards[0].when, NELLIES_BOURBON_WHEN);
    assert.equal(cards[0].ts, NELLIES_BOURBON_STARTS_AT);
    assert.equal(cards[0].location, NELLIES_BOURBON_LOCATION);
    assert.doesNotMatch(cards[0].body ?? "", /rooftop/i);
  });
});

describe("guest surfaces", () => {
  it("keeps Jackie specials as non-SKU info cards", () => {
    const specials = jackieLaunchSpecials();
    assert.equal(specials.length, 3);
    assert.ok(specials.every((s) => s.points_required === null));
  });

  it("ships a real /events page (not a 404) with Jackie + Bourbon date", () => {
    const eventsPage = readFileSync(
      fileURLToPath(new URL("../app/events/page.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(eventsPage, /NELLIES_PUBLISHED_OFFERS/);
    assert.match(eventsPage, /Bourbon & Cigar Night/);
    assert.match(eventsPage, /September 23/);
    assert.match(eventsPage, /NELLIES_BOURBON_WHEN|7:00 PM ET/);
    assert.match(eventsPage, /NELLIES_BOURBON_LOCATION|Private Dining Room/);
    assert.doesNotMatch(eventsPage, /Rooftop/);
    assert.match(eventsPage, /Sign in to RSVP/);
    assert.match(eventsPage, /Join to RSVP/);
    assert.match(eventsPage, /\/login\?next=/);
    assert.doesNotMatch(eventsPage, /RSVP on the brand page/);
  });

  it("renders Jackie’s three on the Nellie brand page source", () => {
    const brandPage = readFileSync(
      fileURLToPath(new URL("../app/brands/[slug]/page.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(brandPage, /jackieLaunchSpecials|NELLIES_PUBLISHED_OFFERS/);
    assert.match(brandPage, /NELLIES_BRAND_SLUG/);
    assert.match(brandPage, /Sign in to RSVP/);
    assert.match(brandPage, /Join to RSVP/);
    assert.match(brandPage, /\/premium\?c=/);
    assert.match(brandPage, /founders/);
  });

  it("hardcodes Nellie fallback with PDR, no apron/hot sauce merch, no Rooftop", () => {
    const brands = readFileSync(
      fileURLToPath(new URL("./brands.ts", import.meta.url)),
      "utf8",
    );
    const nellies = brands.slice(brands.indexOf("nellies:"));
    const block = nellies.slice(0, nellies.indexOf("raelynn:"));
    assert.match(block, /Bourbon & Cigar Night/);
    assert.match(block, /September 23/);
    assert.match(block, /Private Dining Room/);
    assert.doesNotMatch(block, /Apron/);
    assert.doesNotMatch(block, /Hot Sauce/);
    assert.doesNotMatch(block, /Rooftop/);
    assert.match(block, /merch:\s*\[\s*\]/);
  });

  it("does not market apron / hot sauce merch on guest or signed-in surfaces", () => {
    const merchLeak = /\bapron\b|hot\s*sauce|2,\s*200\s*pts|recipe card/i;
    const vipLeak =
      /platinum members|gold members may request|priority seating/i;
    const here = fileURLToPath(new URL(".", import.meta.url));
    const roots = [
      fileURLToPath(new URL("../app", import.meta.url)),
      fileURLToPath(new URL("../components", import.meta.url)),
      here,
    ];
    const skipDirs = new Set(["admin", "api"]);
    const skipFiles = new Set(["nellies-launch.ts", "nellies-launch.test.ts"]);
    const files: string[] = [join(here, "brands.ts")];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (skipDirs.has(name)) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          walk(p);
        } else if (
          /\.(ts|tsx)$/.test(name) &&
          !name.endsWith(".test.ts") &&
          !skipFiles.has(name)
        ) {
          files.push(p);
        }
      }
    };
    for (const root of roots) walk(root);

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const nelliesBlock = file.endsWith("brands.ts")
        ? source.slice(source.indexOf("nellies:"), source.indexOf("raelynn:"))
        : source;
      assert.doesNotMatch(
        nelliesBlock,
        merchLeak,
        `${file} still markets apron/hot sauce merch`,
      );
      const inLib = file.includes("/lib/");
      if (!inLib || file.endsWith("brands.ts")) {
        assert.doesNotMatch(
          nelliesBlock,
          vipLeak,
          `${file} still markets Bourbon Platinum/Gold waitlist copy`,
        );
      }
    }
  });
});
