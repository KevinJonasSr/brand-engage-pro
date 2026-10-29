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
  NELLIES_THREE_VISIT_BONUS,
  NELLIES_THREE_VISIT_REWARD_ID,
  applyNelliesLaunchEvents,
  applyNelliesLaunchOffers,
  applyNelliesLaunchSpecials,
  filterNelliesLaunchLatestCards,
  filterNelliesLaunchRewards,
  isBirthdayRedemptionOpen,
  isNelliesHiddenTitle,
  isNelliesPublishedOfferTitle,
  jackieLaunchSpecials,
  isNelliesThreeVisitOfferTitle,
  nelliesMemberOfferSummary,
  nelliesOfferPitch,
  nelliesPublicOffers,
  resolveBourbonGuestCopy,
  shouldAwardThreeVisitBonus,
} from "./nellies-launch.ts";

const BEFORE_BOURBON_ENDS = new Date("2026-09-20T00:00:00.000Z");
const AFTER_BOURBON_ENDS = new Date("2026-09-28T00:00:00.000Z");

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

  it("injects Jackie’s three onto the brand-page specials surface when the bonus is active", () => {
    const shown = applyNelliesLaunchSpecials(
      "nellies",
      [
        {
          id: "x",
          title: "2-for-1 Fried Chicken Tuesdays",
          points_required: 1,
        },
      ],
      { threeVisitRewardActive: true },
    );
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
    const shown = applyNelliesLaunchSpecials(
      "nellies",
      [
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
      ],
      { threeVisitRewardActive: true },
    );
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

  it("awards 1,500 pts on the 3rd check-in only, once, and only while the catalog reward is active", () => {
    assert.equal(shouldAwardThreeVisitBonus(2, false, true), false);
    assert.equal(shouldAwardThreeVisitBonus(3, false, true), true);
    assert.equal(shouldAwardThreeVisitBonus(4, true, true), false);
    assert.equal(shouldAwardThreeVisitBonus(3, false, false), false);
    assert.equal(shouldAwardThreeVisitBonus(4, false, false), false);
  });

  it("opens birthday entrée only in the stored birthday month", () => {
    const sept = new Date("2026-09-15T16:00:00.000Z");
    assert.equal(isBirthdayRedemptionOpen(9, sept), true);
    assert.equal(isBirthdayRedemptionOpen(8, sept), false);
    assert.equal(isBirthdayRedemptionOpen(null, sept), false);
  });
});

describe("paused 1,500 three-visit reward", () => {
  const CHECKIN_POINTS = 25;

  function pointsForVisit(input: {
    visitNumber: number;
    rewardActive: boolean;
    bonusAlreadyAwarded: boolean;
  }): { checkinPoints: number; bonusPoints: number } {
    const bonus = shouldAwardThreeVisitBonus(
      input.visitNumber,
      input.bonusAlreadyAwarded,
      input.rewardActive,
    );
    return {
      checkinPoints: CHECKIN_POINTS,
      bonusPoints: bonus ? NELLIES_THREE_VISIT_BONUS : 0,
    };
  }

  it("a third check-in grants no bonus while the catalog reward is inactive, and visit points stay 25", () => {
    assert.deepEqual(
      pointsForVisit({ visitNumber: 1, rewardActive: false, bonusAlreadyAwarded: false }),
      { checkinPoints: 25, bonusPoints: 0 },
    );
    assert.deepEqual(
      pointsForVisit({ visitNumber: 3, rewardActive: false, bonusAlreadyAwarded: false }),
      { checkinPoints: 25, bonusPoints: 0 },
    );
    assert.deepEqual(
      pointsForVisit({ visitNumber: 3, rewardActive: true, bonusAlreadyAwarded: false }),
      { checkinPoints: 25, bonusPoints: 1500 },
    );
    assert.deepEqual(
      pointsForVisit({ visitNumber: 4, rewardActive: true, bonusAlreadyAwarded: true }),
      { checkinPoints: 25, bonusPoints: 0 },
    );
  });

  it("hides the 1,500 card on the brand page when the catalog reward is inactive, even if the specials row is still active", () => {
    const shown = applyNelliesLaunchSpecials("nellies", [
      {
        id: "db-bonus",
        title: "1,500 Bonus Points",
        description: "Awarded automatically after your third verified visit check-in.",
        active: true,
      },
      { id: "dessert", title: "Free Dessert w/ Entree", active: true },
      { id: "extra", title: "Half-Price Apps on the Rooftop", active: true },
    ]);
    assert.deepEqual(
      shown.map((s) => s.title),
      ["Free Dessert w/ Entree", "Birthday Entree up to $30", "Half-Price Apps on the Rooftop"],
    );
    assert.equal(
      shown.some((s) => /1,?500|bonus points/i.test(s.title)),
      false,
    );
    assert.deepEqual(
      nelliesPublicOffers().map((o) => o.title),
      ["Free Dessert w/ Entree", "Birthday Entree up to $30"],
    );
    assert.equal(nelliesMemberOfferSummary(false).includes("1,500"), false);
    assert.equal(nelliesOfferPitch(false).includes("1,500"), false);
    assert.equal(isNelliesThreeVisitOfferTitle("1,500 Bonus Points"), true);
    assert.equal(isNelliesThreeVisitOfferTitle("Free Dessert w/ Entree"), false);
  });

  it("shows the 1,500 card again when the catalog reward is turned back on", () => {
    const shown = applyNelliesLaunchSpecials(
      "nellies",
      [{ id: "db-bonus", title: "1,500 Bonus Points", active: true }],
      { threeVisitRewardActive: true },
    );
    assert.equal(
      shown.some((s) => s.title === "1,500 Bonus Points"),
      true,
    );
    assert.deepEqual(
      nelliesPublicOffers({ threeVisitRewardActive: true }).map((o) => o.title),
      [...NELLIES_PUBLISHED_OFFER_TITLES],
    );
    assert.match(nelliesMemberOfferSummary(true), /1,500 bonus points after three visits/);
  });

  it("gates the check-in trigger on that catalog row and leaves the 25-point visit award alone", () => {
    const migration = readFileSync(
      fileURLToPath(
        new URL("../../supabase/migrations/0075_gate_nellies_three_visit_bonus.sql", import.meta.url),
      ),
      "utf8",
    );
    const checkins = readFileSync(
      fileURLToPath(new URL("./data/checkins.ts", import.meta.url)),
      "utf8",
    );
    const specials = readFileSync(
      fileURLToPath(new URL("./data/specials.ts", import.meta.url)),
      "utf8",
    );
    const search = readFileSync(
      fileURLToPath(new URL("./search/query.ts", import.meta.url)),
      "utf8",
    );
    assert.equal(NELLIES_THREE_VISIT_REWARD_ID, "064a11f6-7508-4104-beb5-25cef405e9f7");
    assert.match(migration, /064a11f6-7508-4104-beb5-25cef405e9f7/);
    assert.match(migration, /from public\.rewards_catalog/);
    assert.match(migration, /and active/);
    assert.match(
      migration,
      /create or replace function public\.award_nellies_three_visit_bonus\(\)/,
    );
    assert.match(migration, /create trigger award_nellies_three_visit_bonus/);
    assert.doesNotMatch(migration, /drop function/i);
    assert.doesNotMatch(migration, /alter type/i);
    const gate = migration.indexOf("from public.rewards_catalog");
    const pay = migration.indexOf("insert into public.points_ledger");
    assert.ok(gate > 0 && pay > gate, "inactive catalog row returns before the 1,500 insert");
    assert.match(migration, /1500/);
    assert.match(checkins, /export const CHECKIN_POINTS = 25/);
    assert.doesNotMatch(checkins, /1500|three.visit|NELLIES_THREE_VISIT/);
    assert.match(specials, /threeVisitRewardActive/);
    assert.match(search, /isNelliesThreeVisitOfferTitle/);
    assert.match(search, /NELLIES_THREE_VISIT_REWARD_ID/);
    assert.doesNotMatch(migration, /0b6536f3/);
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
    ], BEFORE_BOURBON_ENDS);
    assert.equal(events.length, 1);
    assert.equal(events[0].title, "Bourbon & Cigar Night");
    assert.equal(events[0].date, NELLIES_BOURBON_WHEN);
    assert.equal(events[0].location, NELLIES_BOURBON_LOCATION);
    assert.equal(events[0].capacity, 40);
    assert.doesNotMatch(events[0].detail, /rooftop/i);
    assert.doesNotMatch(events[0].location, /rooftop/i);
    assert.equal(events[0].startsAt, NELLIES_BOURBON_STARTS_AT);
  });

  it("stops pinning Bourbon once it has ended and shows DB events instead", () => {
    const events = applyNelliesLaunchEvents(
      "nellies",
      [
        { id: "b", title: "Bourbon & Cigar Night", active: true },
        { id: "h", title: "Happy Hour — 50% Off Appetizers", active: true },
        {
          id: "o",
          title: "Oyster Roast",
          detail: "Fresh oysters.",
          event_date: "Thursday, October 22",
          starts_at: "2026-10-22T22:00:00.000Z",
          url: "https://www.eventbrite.com/e/1998696261321",
          tier: "public",
          active: true,
        },
        { id: "p", title: "Past Party", starts_at: "2026-09-01T22:00:00.000Z", active: true },
        { id: "i", title: "Trunk or Treat", active: false },
      ],
      AFTER_BOURBON_ENDS,
    );
    assert.deepEqual(
      events.map((e) => e.title),
      ["Oyster Roast"],
    );
    assert.equal(events[0].url, "https://www.eventbrite.com/e/1998696261321");
    assert.equal(events[0].tier, "public");
    assert.equal(events[0].startsAt, "2026-10-22T22:00:00.000Z");
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

describe("launch content after Bourbon", () => {
  it("lets new specials show after Jackie’s three, including rooftop and happy hour titles", () => {
    const shown = applyNelliesLaunchSpecials(
      "nellies",
      [
        { id: "m", title: "Teachers & First Responders 10% Off", tier: "public", points_required: null },
        { id: "x", title: "Happy Hour — 50% Off Appetizers", tier: "public", points_required: null },
        { id: "a", title: "Half-Price Apps on the Rooftop", tier: "public", points_required: null },
        { id: "d", title: "Free Dessert w/ Entree", tier: "public", points_required: null },
      ],
      { threeVisitRewardActive: true },
    );
    assert.deepEqual(
      shown.map((s) => s.title),
      [
        ...NELLIES_PUBLISHED_OFFER_TITLES,
        "Teachers & First Responders 10% Off",
        "Half-Price Apps on the Rooftop",
      ],
    );
  });

  it("still hides the old titles by exact name", () => {
    for (const title of NELLIES_HIDDEN_TITLES) {
      assert.equal(isNelliesHiddenTitle(title), true, title);
    }
    assert.equal(isNelliesHiddenTitle("Howl-O-Ween After-Pawty"), false);
    assert.equal(isNelliesHiddenTitle("Rooftop Oyster Roast"), false);
  });

  it("passes new events through the Latest strip", () => {
    const cards = filterNelliesLaunchLatestCards("nellies", [
      { kind: "event", title: "Rooftop Karaoke Night", when: "in 2d", ts: "2026-10-01T23:00:00.000Z" },
      { kind: "event", title: "Oyster Roast", when: "in 3w", ts: "2026-10-22T22:00:00.000Z" },
    ]);
    assert.deepEqual(
      cards.map((c) => c.title),
      ["Oyster Roast"],
    );
  });
});

describe("guest surfaces", () => {
  it("keeps Jackie specials as non-SKU info cards", () => {
    const specials = jackieLaunchSpecials();
    assert.equal(specials.length, 3);
    assert.ok(specials.every((s) => s.points_required === null));
  });

  it("ships a real /events page (not a 404) with Jackie’s offers and DB events", () => {
    const eventsPage = readFileSync(
      fileURLToPath(new URL("../app/events/page.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(eventsPage, /nelliesPublicOffers/);
    assert.match(eventsPage, /isNelliesThreeVisitRewardActive/);
    assert.match(eventsPage, /brand\.upcoming/);
    assert.match(eventsPage, /Get tickets/);
    assert.match(eventsPage, /rel="noopener noreferrer"/);
    assert.doesNotMatch(eventsPage, /September 23/);
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
    assert.match(brandPage, /listSpecialsForBrand/);
    assert.match(brandPage, /const guestSpecials = specials;/);
    assert.match(brandPage, /NELLIES_BRAND_SLUG/);
    assert.match(brandPage, /Sign in to RSVP/);
    assert.match(brandPage, /Join to RSVP/);
    assert.doesNotMatch(brandPage, /\/premium\?c=/);
    assert.match(brandPage, /founders/);
  });

  it("hardcodes Nellie fallback with PDR, no apron/hot sauce merch, no Rooftop", () => {
    const brands = readFileSync(
      fileURLToPath(new URL("./brands.ts", import.meta.url)),
      "utf8",
    );
    const nellies = brands.slice(brands.indexOf("nellies:"));
    const block = nellies.slice(0, nellies.indexOf("\n};"));
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
        ? source.slice(source.indexOf("nellies:"), source.indexOf("\n};", source.indexOf("nellies:")))
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
