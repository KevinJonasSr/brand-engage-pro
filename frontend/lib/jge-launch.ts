export const JGE_BRAND_SLUG = "jonas-group-ent";

export type JgeLaunchOffer = {
  slug: string;
  title: string;
  description: string;
};

/** Aug 30 lock — live JGE specials. Do not expand. */
export const JGE_PUBLISHED_SPECIALS: readonly JgeLaunchOffer[] = [
  {
    slug: "jge-music-row-house-tour",
    title: "Music Row House Tour",
    description:
      "A private guided tour of the Jonas Group Entertainment house at 1600 17th Ave South — writer rooms, offices, and the wall of cuts. By reservation.",
  },
  {
    slug: "jge-early-writer-listens",
    title: "Early Writer / Artist Listens",
    description:
      "Hear new writer and artist work from the JGE roster before it goes wide. Dates land in the member feed.",
  },
  {
    slug: "jge-rotating-live-access",
    title: "Rotating Live Access",
    description:
      "Capped live access that rotates across Kevin, Leslie, Amanda, Abby, and Raymond. Limited seats — claim when a window opens.",
  },
];

export const JGE_PUBLISHED_SPECIAL_SLUGS: readonly string[] =
  JGE_PUBLISHED_SPECIALS.map((o) => o.slug);

export const JGE_PUBLISHED_SPECIAL_TITLES: readonly string[] =
  JGE_PUBLISHED_SPECIALS.map((o) => o.title);

/** Guest-facing brand bio. Do not market hidden Aug 30 offers. */
export const JGE_LAUNCH_BIO = [
  "Jonas Group Entertainment is a full-service entertainment company on Nashville's historic Music Row, owned by the Jonas family. We are a label, a publisher, an artist-management group, and a steward of some of the most influential catalogs in country and pop.",
  "Under our roof: Red Van Records (label), Jonas Group Publishing (songwriter representation and catalog), and a management roster that includes Rhett Akins, Aaron Gillespie, Levi Hummon, RaeLynn, Bailee Madison, Franklin Jonas, Justin Ebach, David Kalmusky, Hunter Hawkins, Amy Stroup, and Dan Marshall. Jonas Group Publishing champions Music Row catalogs through signings, acquisitions, and sync — including the acquired Jonas Brothers catalog.",
  "This page is for the people who've been on our list for years — fans of the artists, friends of the family, and members of the broader Jonas universe. Live access includes a Music Row house tour, early writer and artist listens, and capped rotating live sessions with Kevin, Leslie, Amanda, Abby, and Raymond.",
].join("\n\n");

export function applyJgeLaunchBio(brandSlug: string, bio: string | null): string {
  if (brandSlug.toLowerCase() !== JGE_BRAND_SLUG) return bio ?? "";
  return JGE_LAUNCH_BIO;
}

/** Must not show as live JGE offers (Aug 30 lock). */
export const JGE_HIDDEN_TITLES: readonly string[] = [
  "Roster Presale Access",
  "Member Listening Parties",
  "Songwriter Round at the Nashville HQ",
  "Songwriter Round at the Music Row House",
  "New-Release Listening Party — Spring Drop",
  "Exclusive Pre-Sale Code",
  "Priority Ticket Window",
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

export function isJgePublishedSpecialTitle(title: string): boolean {
  const t = fold(title);
  return JGE_PUBLISHED_SPECIAL_TITLES.some((live) => fold(live) === t);
}

export function isJgeHiddenTitle(title: string): boolean {
  if (isJgePublishedSpecialTitle(title)) return false;
  const t = fold(title);
  if (t.includes("presale") || t.includes("pre sale")) return true;
  if (t.includes("listening part")) return true;
  if (t.includes("songwriter round") || t.includes("writers round")) return true;
  return JGE_HIDDEN_TITLES.some((hidden) => fold(hidden) === t);
}

export function jgePublishedSpecialIndex(title: string): number {
  const t = fold(title);
  return JGE_PUBLISHED_SPECIALS.findIndex((o) => fold(o.title) === t);
}

export type JgeLaunchSpecial = {
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

export function jgeLaunchSpecials(): JgeLaunchSpecial[] {
  return JGE_PUBLISHED_SPECIALS.map((offer, index) => ({
    id: `jge-lock:${offer.slug}`,
    brand_slug: JGE_BRAND_SLUG,
    community_id: JGE_BRAND_SLUG,
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
 * Guest/member specials on /brands/jonas-group-ent. Always the Aug 30
 * lock set. Prefer matching DB rows for stable ids.
 */
export function applyJgeLaunchSpecials<T extends { title: string; id: string }>(
  brandSlug: string,
  rows: T[],
): Array<T | JgeLaunchSpecial> {
  if (brandSlug.toLowerCase() !== JGE_BRAND_SLUG) return rows;
  const seeded = jgeLaunchSpecials();
  const slots: Array<T | JgeLaunchSpecial> = [...seeded];
  for (const row of rows) {
    if (isJgeHiddenTitle(row.title)) continue;
    const index = jgePublishedSpecialIndex(row.title);
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

export function filterJgeLaunchEvents<T extends { title: string }>(
  brandSlug: string,
  rows: T[],
): T[] {
  if (brandSlug.toLowerCase() !== JGE_BRAND_SLUG) return rows;
  return rows.filter((row) => !isJgeHiddenTitle(row.title));
}
