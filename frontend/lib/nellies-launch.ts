/**
 * Nellie's / Jackie launch — guest-visible set and real perk rules.
 *
 * Jackie's three are NOT 1-pt catalog SKUs (rewards_catalog.point_cost > 0).
 * Welcome dessert and the birthday entrée display on the brand page as
 * specials. The 1,500 three-visit bonus displays, and the check-in
 * trigger pays it, only while rewards_catalog row
 * NELLIES_THREE_VISIT_REWARD_ID is active. Turning that row off pauses
 * both. Turning it back on resumes both. Do not delete the rule.
 *
 * Active Jackie offers show first. After them, active DB specials and
 * upcoming DB events show too, unless they are on the hide list below.
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
export const NELLIES_BOURBON_DETAIL_FALLBACK =
  "Premium bourbon pours and hand-selected cigars. Members welcome.";

export const NELLIES_THREE_VISIT_THRESHOLD = 3;
export const NELLIES_THREE_VISIT_BONUS = 1500;
/**
 * rewards_catalog.id for "1,500 Bonus Points". The row's active flag
 * gates the check-in trigger (migration 0075) and the brand-page card.
 */
export const NELLIES_THREE_VISIT_REWARD_ID =
  "064a11f6-7508-4104-beb5-25cef405e9f7";
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
      "Yours when you join, no points needed. Get a free dessert with any entrée. Just show your member card.",
    rule: "join-grant",
  },
  {
    slug: "nsk-3-visit-bonus",
    title: "1,500 Bonus Points",
    description:
      "Added to your account automatically after you check in on your third visit.",
    rule: "third-checkin",
  },
  {
    slug: "nsk-birthday-entree",
    title: "Birthday Entree up to $30",
    description:
      "Use it during your birthday month on an entrée up to $30. Add your birthday month to your profile to get it.",
    rule: "birthday-month",
  },
];

/** Offers to render. The 1,500 card is included only while its catalog row is active. */
export function nelliesPublicOffers(options?: {
  threeVisitRewardActive?: boolean;
}): readonly NelliesLaunchOffer[] {
  if (options?.threeVisitRewardActive) return NELLIES_PUBLISHED_OFFERS;
  return NELLIES_PUBLISHED_OFFERS.filter((offer) => offer.rule !== "third-checkin");
}

/** Guest sentence for Nellie's member offers. Omits the paused 1,500 bonus. */
export function nelliesMemberOfferSummary(threeVisitRewardActive: boolean): string {
  if (threeVisitRewardActive) {
    return "free dessert with an entrée when you join, 1,500 bonus points after three visits, and a birthday entrée up to $30";
  }
  return "free dessert with an entrée when you join and a birthday entrée up to $30";
}

/** Shorter public pitch. Same active-flag gate as the brand-page card. */
export function nelliesOfferPitch(threeVisitRewardActive: boolean): string {
  if (threeVisitRewardActive) {
    return "free dessert when you join, 1,500 bonus points after 3 visits, and a birthday entrée";
  }
  return "free dessert when you join and a birthday entrée";
}

/** True for the 1,500 three-visit title, including close variants of that name. */
export function isNelliesThreeVisitOfferTitle(title: string): boolean {
  const index = jackieOfferIndexForTitle(title);
  return index >= 0 && NELLIES_PUBLISHED_OFFERS[index]?.rule === "third-checkin";
}

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

/**
 * Founder call: Private Dining Room, not Rooftop. Sept 23 2026 7pm ET, cap 40.
 * Always stamp those fields. DB detail still carries VIP/tier leak
 * (Platinum priority / Gold waitlist from 0048) — never guest-visible.
 */
export type BourbonGuestCopy = {
  location: string;
  detail: string;
  capacity: number;
};

function stripPhrase(text: string, pattern: RegExp): string {
  return text
    .replace(pattern, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.—–-])/g, "$1")
    .replace(/^[,.—–-]\s*/, "")
    .trim();
}

export function resolveBourbonGuestCopy(row: {
  location?: string | null;
  detail?: string | null;
  capacity?: number | null;
}): BourbonGuestCopy {
  const raw = (row.detail ?? "").trim();
  const hadVipLeak =
    /platinum|gold members|priority seating|\bwaitlist\b/i.test(raw);
  let detail = hadVipLeak ? "" : raw;
  detail = stripPhrase(detail, /\s*on the rooftop\b/gi);
  detail = stripPhrase(detail, /\brooftop\b/gi);
  return {
    location: NELLIES_BOURBON_LOCATION,
    detail: detail || NELLIES_BOURBON_DETAIL_FALLBACK,
    capacity: NELLIES_BOURBON_CAPACITY,
  };
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
  /biscuit making/,
  /music row/,
  /complimentary dessert/,
  /complimentary app/,
  /seasonal menu/,
  /branded merch/,
  /recipe card set/,
  /del webb/,
  /karaoke/,
];

const HIDDEN_TITLE_KEYS = new Set(NELLIES_HIDDEN_TITLES.map(fold));

/**
 * Old titles are hidden by exact name, plus a few narrow patterns. Broad
 * words like "rooftop" and "happy hour" are no longer blocked, so new
 * specials such as the rooftop apps deal can be published.
 */
export function isNelliesHiddenTitle(title: string): boolean {
  if (isNelliesPublishedOfferTitle(title) || isBourbonCigarTitle(title)) {
    return false;
  }
  const t = fold(title);
  return HIDDEN_TITLE_KEYS.has(t) || HIDDEN_PATTERNS.some((re) => re.test(t));
}

/**
 * Whether the 1,500 three-visit bonus should be written.
 * award_nellies_three_visit_bonus (migration 0075) is the writer. It
 * uses this same rule: catalog reward active, third-or-later visit, once.
 * Visit check-in points (25) are a separate ledger row and are not this bonus.
 */
export function shouldAwardThreeVisitBonus(
  checkinCount: number,
  alreadyAwarded: boolean,
  rewardActive: boolean,
): boolean {
  return (
    rewardActive &&
    !alreadyAwarded &&
    checkinCount >= NELLIES_THREE_VISIT_THRESHOLD
  );
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
 * Guest brand page reads specials, not catalog.active, then this filter.
 * Welcome dessert and the birthday entrée stay first as info cards
 * (0 pt / not SKUs). The 1,500 card is included only when
 * threeVisitRewardActive is true (the catalog row is on). A specials
 * row for that title is dropped while the catalog row is off, so an
 * active special cannot keep advertising a paused reward. Prefer
 * matching DB rows only for stable ids — never copy point_cost from a
 * 1-pt SKU. Other active DB specials follow in their own sort order,
 * minus hidden ones.
 */
export function applyNelliesLaunchSpecials<T extends { title: string; id: string }>(
  brandSlug: string,
  rows: T[],
  options?: { threeVisitRewardActive?: boolean },
): Array<T | LaunchSpecial> {
  if (brandSlug.toLowerCase() !== NELLIES_BRAND_SLUG) {
    return rows;
  }
  const threeVisitRewardActive = options?.threeVisitRewardActive === true;
  const seeded = jackieLaunchSpecials();
  const threeVisitIndex = NELLIES_PUBLISHED_OFFERS.findIndex(
    (offer) => offer.rule === "third-checkin",
  );
  const slots: Array<T | LaunchSpecial | null> = seeded.map((special, index) =>
    !threeVisitRewardActive && index === threeVisitIndex ? null : special,
  );
  const extras: T[] = [];
  for (const row of rows) {
    if (isNelliesHiddenTitle(row.title)) continue;
    const index = jackieOfferIndexForTitle(row.title);
    if (index < 0) {
      if (!isBourbonCigarTitle(row.title)) extras.push(row);
      continue;
    }
    // Catalog row is off: do not keep a specials-table copy of the bonus.
    if (slots[index] == null) continue;
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
  return [
    ...slots.filter((slot): slot is T | LaunchSpecial => slot != null),
    ...extras,
  ];
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
  /** When RSVPs open to non-founders (0074). Null or missing means open now. */
  rsvpOpensAt?: string | null;
  active?: boolean;
};

export const NELLIES_BOURBON_EVENT: LaunchEvent = {
  id: "launch:bourbon-cigar",
  title: NELLIES_BOURBON_TITLE,
  detail: NELLIES_BOURBON_DETAIL_FALLBACK,
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
    url?: string | null;
    tier?: string | null;
    rsvp_opens_at?: string | null;
  },
>(brandSlug: string, rows: T[], now: Date = new Date()): LaunchEvent[] {
  if (brandSlug.toLowerCase() !== NELLIES_BRAND_SLUG) {
    return rows
      .filter((row) => row.active !== false)
      .map((row) => ({
        id: row.id,
        title: row.title,
        detail: row.detail ?? "",
        date: row.event_date ?? "",
        location: row.location ?? "",
        capacity: row.capacity ?? null,
        rsvpOpensAt: row.rsvp_opens_at ?? null,
      }));
  }
  const nowMs = now.getTime();
  const upcoming = rows
    .filter((row) => row.active !== false)
    .filter((row) => !isBourbonCigarTitle(row.title))
    .filter((row) => !isNelliesHiddenTitle(row.title))
    .filter((row) => {
      const start = row.starts_at ?? row.event_starts_at;
      return !start || new Date(start).getTime() >= nowMs;
    })
    .map(
      (row): LaunchEvent => ({
        id: row.id,
        title: row.title,
        detail: row.detail ?? "",
        date: row.event_date ?? "",
        location: row.location ?? "",
        startsAt: row.starts_at ?? row.event_starts_at ?? null,
        capacity: row.capacity ?? null,
        url: row.url ?? null,
        tier: row.tier === "premium" ? "premium" : "public",
        rsvpOpensAt: row.rsvp_opens_at ?? null,
        active: true,
      }),
    );
  // Bourbon & Cigar Night stays pinned only until it ends.
  if (new Date(NELLIES_BOURBON_ENDS_AT).getTime() <= nowMs) {
    return upcoming;
  }
  const match = rows.find((row) => isBourbonCigarTitle(row.title));
  const copy = resolveBourbonGuestCopy({
    location: match?.location,
    detail: match?.detail,
    capacity: match?.capacity,
  });
  return [
    {
      ...NELLIES_BOURBON_EVENT,
      id: match?.id ?? NELLIES_BOURBON_EVENT.id,
      title: NELLIES_BOURBON_TITLE,
      detail: copy.detail,
      date: NELLIES_BOURBON_WHEN,
      location: copy.location,
      startsAt: NELLIES_BOURBON_STARTS_AT,
      endsAt: NELLIES_BOURBON_ENDS_AT,
      capacity: copy.capacity,
    },
    ...upcoming,
  ];
}

export type LaunchLatestCard = {
  kind?: string;
  title: string;
  when?: string;
  ts?: string;
  body?: string | null;
  location?: string | null;
};

/**
 * LatestStrip queries brand_events directly. Drop hidden titles; stamp
 * Bourbon with PDR, Sept 23 · 7:00 PM ET, cap 40. Other events pass through.
 */
export function filterNelliesLaunchLatestCards<T extends LaunchLatestCard>(
  brandSlug: string,
  cards: T[],
): T[] {
  if (brandSlug.toLowerCase() !== NELLIES_BRAND_SLUG) {
    return cards;
  }
  const out: T[] = [];
  for (const card of cards) {
    if (isNelliesHiddenTitle(card.title)) continue;
    if (isBourbonCigarTitle(card.title)) {
      const copy = resolveBourbonGuestCopy({
        location: card.location,
        detail: card.body,
      });
      out.push({
        ...card,
        title: NELLIES_BOURBON_TITLE,
        when: NELLIES_BOURBON_WHEN,
        ts: NELLIES_BOURBON_STARTS_AT,
        body: copy.detail,
        location: copy.location,
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
    return rows;
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
