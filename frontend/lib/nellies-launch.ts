/**
 * Nellie's / Jackie launch — guest-visible set and real perk rules.
 *
 * Jackie's three are NOT 1-pt catalog SKUs (rewards_catalog.point_cost > 0).
 * They display on the brand page as specials; grants happen on join,
 * 3rd check-in, and birthday-month redeem.
 *
 * Launch set: those three + Bourbon & Cigar Night. Do not expand.
 */

export const NELLIES_BRAND_SLUG = "nellies";

export const NELLIES_BOURBON_TITLE = "Bourbon & Cigar Night";
export const NELLIES_BOURBON_WHEN = "Wednesday, September 23 · 7:00 PM ET";
export const NELLIES_BOURBON_LOCATION =
  "Nellie's Southern Kitchen — Private Dining Room";
/** 7:00 PM America/New_York on 2026-09-23 (EDT, UTC−4). */
export const NELLIES_BOURBON_STARTS_AT = "2026-09-23T23:00:00.000Z";
export const NELLIES_BOURBON_ENDS_AT = "2026-09-24T02:00:00.000Z";
export const NELLIES_BOURBON_CAPACITY = 40;
export const NELLIES_BOURBON_DETAIL =
  "Premium bourbon pours and hand-selected cigars. Members welcome.";

export const NELLIES_THREE_VISIT_THRESHOLD = 3;
export const NELLIES_THREE_VISIT_BONUS = 1500;
export const NELLIES_WELCOME_PERK_SLUG = "nsk-welcome-dessert";
export const NELLIES_BIRTHDAY_PERK_SLUG = "nsk-birthday-entree";

export type NelliesLaunchOffer = {
  slug: string;
  title: string;
  description: string;
  rule: "join-grant" | "third-checkin" | "birthday-month";
};

/** Data's show list — Jackie’s three. Exact guest-facing titles. */
export const NELLIES_PUBLISHED_OFFERS: readonly NelliesLaunchOffer[] = [
  {
    slug: "nsk-free-dessert",
    title: "Free Dessert w/ Entree",
    description:
      "Granted when you join — not a points redeemable. Complimentary dessert with an entrée. Show your member card.",
    rule: "join-grant",
  },
  {
    slug: "nsk-3-visit-bonus",
    title: "1,500 Bonus Points",
    description:
      "Awarded automatically after your third verified visit check-in — not a catalog SKU.",
    rule: "third-checkin",
  },
  {
    slug: "nsk-birthday-entree",
    title: "Birthday Entree up to $30",
    description:
      "Redeemable during your birthday month (entrée up to $30). Add your birthday month on your profile — not a 1-pt SKU.",
    rule: "birthday-month",
  },
];

export const NELLIES_PUBLISHED_OFFER_SLUGS: readonly string[] =
  NELLIES_PUBLISHED_OFFERS.map((o) => o.slug);

export const NELLIES_PUBLISHED_OFFER_TITLES: readonly string[] =
  NELLIES_PUBLISHED_OFFERS.map((o) => o.title);

/**
 * Hide list (unpublish, do not delete). Includes extras Lyra still saw
 * live, 1500/2200 merch, LIVEBOOTH, and the duplicate pile.
 */
export const NELLIES_HIDDEN_TITLES: readonly string[] = [
  "Nellie's Apron + Recipe Card",
  "House Hot Sauce 3-Pack",
  "2-for-1 Fried Chicken Tuesdays",
  "Bottomless Biscuits at Sunday Brunch",
  "The Memorabilia Hallway Tour",
  "Reserved Booth on Live Music Nights",
  "Biscuit-Making Class with the Kitchen",
  "Music Row House Tour",
  "Music Row House Tour — Founders",
  "Happy Hour — 50% Off Appetizers",
  "Del Webb Rooftop Happy Hour",
  "Live Music — Rooftop (Thursday)",
  "Live Music — Rooftop (Friday)",
  "Rooftop Karaoke Night",
  "Complimentary Appetizer",
  "Complimentary Dessert",
  "Seasonal Menu Early Access",
  "NSK Branded Merch",
  "NSK Branded Merchandise",
];

function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isBourbonCigarTitle(title: string): boolean {
  const t = fold(title);
  return t.includes("bourbon") && t.includes("cigar");
}

export function stripRooftop(text: string): string {
  return text
    .replace(/\brooftop\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.—–-])/g, "$1")
    .trim();
}

function isJackieWelcome(title: string): boolean {
  const t = fold(title);
  if (t.includes("complimentary")) return false;
  if (t.includes("free dessert") && t.includes("entree")) return true;
  return t === "free dessert";
}

function isJackieThreeVisit(title: string): boolean {
  const t = fold(title);
  if (t.includes("apron") || t.includes("hot sauce")) return false;
  return (
    (t.includes("1500") || t.includes("1 500")) &&
    (t.includes("bonus") || t.includes("visit") || t.includes("points"))
  );
}

function isJackieBirthday(title: string): boolean {
  const t = fold(title);
  return t.includes("birthday") && t.includes("entree");
}

export function jackieOfferIndexForTitle(title: string): number {
  if (isJackieWelcome(title)) return 0;
  if (isJackieThreeVisit(title)) return 1;
  if (isJackieBirthday(title)) return 2;
  const exact = fold(title);
  return NELLIES_PUBLISHED_OFFERS.findIndex((o) => fold(o.title) === exact);
}

export function isNelliesPublishedOfferTitle(title: string): boolean {
  return jackieOfferIndexForTitle(title) >= 0;
}

const HIDDEN_PATTERNS: RegExp[] = [
  /\bapron\b/,
  /hot sauce/,
  /fried chicken/,
  /bottomless biscuit/,
  /hallway/,
  /reserved booth/,
  /livebooth/,
  /happy hour/,
  /biscuit making/,
  /music row/,
  /complimentary dessert/,
  /complimentary app/,
  /seasonal menu/,
  /branded merch/,
  /recipe card set/,
  /rooftop/,
  /del webb/,
  /karaoke/,
];

export function isNelliesHiddenTitle(title: string): boolean {
  if (isNelliesPublishedOfferTitle(title) || isBourbonCigarTitle(title)) {
    return false;
  }
  const t = fold(title);
  return HIDDEN_PATTERNS.some((re) => re.test(t));
}

export function shouldAwardThreeVisitBonus(
  checkinCount: number,
  alreadyAwarded: boolean,
): boolean {
  return !alreadyAwarded && checkinCount >= NELLIES_THREE_VISIT_THRESHOLD;
}

export function isBirthdayRedemptionOpen(
  birthdayMonth: number | null | undefined,
  now: Date = new Date(),
  timeZone = "America/New_York",
): boolean {
  if (!birthdayMonth || birthdayMonth < 1 || birthdayMonth > 12) return false;
  const month = Number(
    new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone }).format(now),
  );
  return month === birthdayMonth;
}

export type LaunchSpecial = {
  id: string;
  brand_slug: string;
  community_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  recurrence_rule: string | null;
  days_of_week: number[] | null;
  redemption_code: string | null;
  points_required: number | null;
  tier: "public" | "premium" | "founder-only";
  sort_order: number;
  active: boolean;
  is_drop: boolean;
  drops_at: string | null;
  expires_at: string | null;
};

export function jackieLaunchSpecials(): LaunchSpecial[] {
  return NELLIES_PUBLISHED_OFFERS.map((offer, index) => ({
    id: `launch:${offer.slug}`,
    brand_slug: NELLIES_BRAND_SLUG,
    community_id: NELLIES_BRAND_SLUG,
    title: offer.title,
    description: offer.description,
    image_url: null,
    starts_at: null,
    ends_at: null,
    recurrence_rule: null,
    days_of_week: null,
    redemption_code: null,
    points_required: null,
    tier: "public",
    sort_order: index + 1,
    active: true,
    is_drop: false,
    drops_at: null,
    expires_at: null,
  }));
}

/**
 * Guest brand page reads specials, not catalog.active. Always return
 * Jackie's three as info cards (0 pt / not SKUs). Prefer matching DB
 * rows only for stable ids — never copy point_cost from a 1-pt SKU.
 */
export function applyNelliesLaunchSpecials<T extends { title: string; id: string }>(
  brandSlug: string,
  rows: T[],
): Array<T | LaunchSpecial> {
  if (brandSlug.toLowerCase() !== NELLIES_BRAND_SLUG) {
    return rows.filter((row) => !isNelliesHiddenTitle(row.title));
  }
  const seeded = jackieLaunchSpecials();
  const slots: Array<T | LaunchSpecial> = [...seeded];
  for (const row of rows) {
    if (isNelliesHiddenTitle(row.title)) continue;
    const index = jackieOfferIndexForTitle(row.title);
    if (index < 0) continue;
    const seed = seeded[index];
    slots[index] = {
      ...row,
      title: seed.title,
      description: seed.description,
      active: true,
      sort_order: seed.sort_order,
      points_required: null,
      redemption_code: null,
      tier: "public",
    } as T;
  }
  return slots;
}

export type LaunchEvent = {
  id?: string;
  title: string;
  detail: string;
  date: string;
  location: string;
  startsAt?: string | null;
  endsAt?: string | null;
  capacity?: number | null;
  url?: string | null;
  tier?: "public" | "premium";
  active?: boolean;
};

export const NELLIES_BOURBON_EVENT: LaunchEvent = {
  id: "launch:bourbon-cigar",
  title: NELLIES_BOURBON_TITLE,
  detail: NELLIES_BOURBON_DETAIL,
  date: NELLIES_BOURBON_WHEN,
  location: NELLIES_BOURBON_LOCATION,
  startsAt: NELLIES_BOURBON_STARTS_AT,
  endsAt: NELLIES_BOURBON_ENDS_AT,
  capacity: NELLIES_BOURBON_CAPACITY,
  url: null,
  tier: "public",
  active: true,
};

export function applyNelliesLaunchEvents<
  T extends {
    title: string;
    detail?: string | null;
    event_date?: string | null;
    location?: string | null;
    active?: boolean;
    id?: string;
    starts_at?: string | null;
    event_starts_at?: string | null;
    capacity?: number | null;
  },
>(brandSlug: string, rows: T[]): LaunchEvent[] {
  if (brandSlug.toLowerCase() !== NELLIES_BRAND_SLUG) {
    return rows
      .filter((row) => row.active !== false && !isNelliesHiddenTitle(row.title))
      .map((row) => ({
        id: row.id,
        title: row.title,
        detail: row.detail ?? "",
        date: row.event_date ?? "",
        location: row.location ?? "",
        capacity: row.capacity ?? null,
      }));
  }
  const match = rows.find((row) => isBourbonCigarTitle(row.title));
  return [
    {
      ...NELLIES_BOURBON_EVENT,
      id: match?.id ?? NELLIES_BOURBON_EVENT.id,
      title: NELLIES_BOURBON_TITLE,
      detail: stripRooftop(NELLIES_BOURBON_DETAIL),
      // Always force the guest-visible date. Live 0048 rows still have
      // relative starts_at / null event_date, which is why Sept 23 7pm ET
      // does not show even when PDR + cap 40 already do.
      date: NELLIES_BOURBON_WHEN,
      location: NELLIES_BOURBON_LOCATION,
      startsAt: NELLIES_BOURBON_STARTS_AT,
      endsAt: NELLIES_BOURBON_ENDS_AT,
      capacity: NELLIES_BOURBON_CAPACITY,
    },
  ];
}

export type LaunchLatestCard = {
  kind?: string;
  title: string;
  when?: string;
  ts?: string;
  body?: string | null;
};

/**
 * LatestStrip queries brand_events directly (and matches null
 * event_starts_at), so unpublished-in-SQL-only is not enough. Drop Hana's
 * rooftop extras and stamp Bourbon with Sept 23 · 7:00 PM ET.
 */
export function filterNelliesLaunchLatestCards<T extends LaunchLatestCard>(
  brandSlug: string,
  cards: T[],
): T[] {
  if (brandSlug.toLowerCase() !== NELLIES_BRAND_SLUG) {
    return cards.filter((card) => !isNelliesHiddenTitle(card.title));
  }
  const out: T[] = [];
  for (const card of cards) {
    if (isNelliesHiddenTitle(card.title)) continue;
    if (card.kind === "event" && !isBourbonCigarTitle(card.title)) continue;
    if (isBourbonCigarTitle(card.title)) {
      out.push({
        ...card,
        title: NELLIES_BOURBON_TITLE,
        when: NELLIES_BOURBON_WHEN,
        ts: NELLIES_BOURBON_STARTS_AT,
        body: stripRooftop(card.body ?? NELLIES_BOURBON_DETAIL),
      });
      continue;
    }
    out.push(card);
  }
  return out;
}

/** Jackie launch has no merch redeemables. Hide apron/hot sauce and 1-pt SKUs. */
export function filterNelliesLaunchRewards<T extends { title: string }>(
  communityId: string,
  rows: T[],
): T[] {
  if (communityId.toLowerCase() !== NELLIES_BRAND_SLUG) {
    return rows.filter((row) => !isNelliesHiddenTitle(row.title));
  }
  return [];
}

/**
 * Do not publish Jackie's three as marketplace/catalog rows (those are
 * 1-pt SKUs). Hide extras; leave marketplace empty for Nellie's launch.
 */
export function applyNelliesLaunchOffers<
  T extends { title: string; slug?: string },
>(communityId: string, rows: T[]): T[] {
  if (communityId.toLowerCase() !== NELLIES_BRAND_SLUG) return rows;
  return rows.filter(
    (row) =>
      !isNelliesHiddenTitle(row.title) &&
      !isNelliesPublishedOfferTitle(row.title) &&
      !isBourbonCigarTitle(row.title),
  );
}
