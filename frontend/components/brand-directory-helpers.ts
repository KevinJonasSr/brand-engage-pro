// Pure helpers shared by the brand directory (/brands), the "My brands"
// section on /me, and the brand page's Upcoming empty state. No imports so
// the node test runner can load this file directly.

export type FollowerCountResult = { slug: string; count: number | null };

/** Fold per-brand head-count results into a slug → count map. Null counts
 * (query error) read as 0 so the card simply hides the chip. */
export function followerCountsFromResults(
  results: FollowerCountResult[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of results) out[r.slug] = Math.max(0, r.count ?? 0);
  return out;
}

/** Set of brand slugs the viewer follows, from their own following rows. */
export function followedSlugSet(
  rows: Array<{ brand_slug: string }> | null | undefined,
): Set<string> {
  return new Set((rows ?? []).map((r) => r.brand_slug));
}

/** Login URL that returns the viewer to the directory after signing in. */
export function followLoginHref(next: string = "/brands"): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

export type MyBrandItem = {
  slug: string;
  name: string;
  tier: string | null;
  href: string;
  rewardsHref: string;
};

/**
 * Merge the member's follows and community memberships into one list,
 * keyed by brand slug (community_id == brand slug since migration 0081).
 * Brands that are no longer active (not in `brands`) are dropped. Order
 * follows the directory's brand order.
 */
export function buildMyBrands(
  brands: Array<{ slug: string; name: string }>,
  follows: Array<{ brand_slug: string }> | null | undefined,
  memberships:
    | Array<{ community_id: string; current_tier: string | null }>
    | null
    | undefined,
): MyBrandItem[] {
  const followed = followedSlugSet(follows);
  const tierBySlug = new Map<string, string | null>();
  for (const m of memberships ?? []) {
    tierBySlug.set(m.community_id, m.current_tier ?? null);
  }
  const items: MyBrandItem[] = [];
  for (const b of brands) {
    if (!followed.has(b.slug) && !tierBySlug.has(b.slug)) continue;
    items.push({
      slug: b.slug,
      name: b.name,
      tier: tierBySlug.get(b.slug) ?? null,
      href: `/brands/${b.slug}`,
      rewardsHref: `/brands/${b.slug}/rewards`,
    });
  }
  return items;
}

/** Capitalise a tier slug for display ("gold" → "Gold"). */
export function tierLabel(tier: string | null): string | null {
  if (!tier) return null;
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/** Copy for the Upcoming section when a brand has no events scheduled. */
export function upcomingEmptyCopy(
  brandName: string,
  isFollowing: boolean,
): { title: string; body: string } {
  return {
    title: "No events on the calendar yet.",
    body: isFollowing
      ? `You follow ${brandName}, so you’ll hear when one is announced.`
      : `Follow ${brandName} to hear when one is announced.`,
  };
}

// ---------------------------------------------------------------------------
// Discovery (category · city · near me)
// ---------------------------------------------------------------------------

/** `brands.category` enum (migration 0024). */
export type BrandCategory = "restaurant" | "retail" | "sports" | "hotel";

/** Canonical chip order + plural labels for the category chip row. */
export const BRAND_CATEGORY_ORDER: BrandCategory[] = [
  "restaurant",
  "retail",
  "sports",
  "hotel",
];

export const BRAND_CATEGORY_LABELS: Record<BrandCategory, string> = {
  restaurant: "Restaurants",
  retail: "Retail",
  sports: "Sports",
  hotel: "Hotels",
};

export function isBrandCategory(value: unknown): value is BrandCategory {
  return (
    typeof value === "string" &&
    (BRAND_CATEGORY_ORDER as string[]).includes(value)
  );
}

/** Categories that have at least one brand, in canonical order. */
export function presentCategories(
  brands: Array<{ category: string | null | undefined }>,
): BrandCategory[] {
  const seen = new Set<string>();
  for (const b of brands) if (b.category) seen.add(b.category);
  return BRAND_CATEGORY_ORDER.filter((c) => seen.has(c));
}

export type BrandDirectoryFilters = {
  genre?: string | null;
  category?: string | null;
  near?: boolean;
};

/** Build a /brands URL preserving the other active filters. */
export function brandDirectoryHref(filters: BrandDirectoryFilters): string {
  const qs = new URLSearchParams();
  if (filters.genre) qs.set("genre", filters.genre);
  if (filters.category) qs.set("category", filters.category);
  if (filters.near) qs.set("near", "1");
  const s = qs.toString();
  return s ? `/brands?${s}` : "/brands";
}

/**
 * Normalise a free-text city for matching: lower-case, trim, drop anything
 * after the first comma ("Belmont, NC" → "belmont"), collapse whitespace.
 */
export function normalizeCity(city: string | null | undefined): string {
  if (!city) return "";
  return city
    .split(",")[0]
    .toLowerCase()
    .replace(/[.’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cityMatches(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeCity(a);
  const nb = normalizeCity(b);
  return na.length > 0 && na === nb;
}

/** Great-circle distance in statute miles. */
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.7613; // mean Earth radius, miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** "0.4 mi", "2.3 mi", "18 mi" — one decimal under 10 miles. */
export function formatMiles(miles: number): string {
  if (!Number.isFinite(miles) || miles < 0) return "";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export type BrandCoords = {
  slug: string;
  lat: number | string | null;
  lng: number | string | null;
};

function numeric(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** True when at least one brand has usable coordinates. */
export function anyBrandHasCoords(brands: BrandCoords[]): boolean {
  return brands.some((b) => numeric(b.lat) !== null && numeric(b.lng) !== null);
}

/**
 * Brands with coordinates, nearest first. Brands without lat/lng are
 * dropped (the caller falls back to the server order for those). Supabase
 * returns `numeric` columns as strings, so both forms are accepted.
 */
export function rankByDistance(
  brands: BrandCoords[],
  origin: { lat: number; lng: number },
): Array<{ slug: string; miles: number }> {
  const out: Array<{ slug: string; miles: number }> = [];
  for (const b of brands) {
    const lat = numeric(b.lat);
    const lng = numeric(b.lng);
    if (lat === null || lng === null) continue;
    out.push({ slug: b.slug, miles: haversineMiles(origin.lat, origin.lng, lat, lng) });
  }
  return out.sort((a, b) => a.miles - b.miles);
}
