import type { Brand } from "./brands";

/** Live brands guests should discover on `/` and `/for-brands`. */
const GUEST_HOME_FEATURED_SLUGS = ["nellies", "jonas-group-ent"] as const;

export function isGuestHomeFeaturedBrand(brand: {
  slug: string;
  name: string;
}): boolean {
  return (GUEST_HOME_FEATURED_SLUGS as readonly string[]).includes(brand.slug);
}

/**
 * Guest `/` and `/for-brands` featured tiles. Nellie's + JGE first so
 * both live clubs are discoverable. Callers must not use this to 404 a
 * brand page or drop a row from `listBrands()`.
 */
export function featuredBrandsForGuestHome(
  brands: Brand[],
  limit = 5,
): Brand[] {
  const featured = GUEST_HOME_FEATURED_SLUGS.map((slug) =>
    brands.find((b) => b.slug === slug),
  ).filter((b): b is Brand => Boolean(b));
  if (featured.length > 0) return featured.slice(0, limit);
  return brands.filter(isGuestHomeFeaturedBrand).slice(0, limit);
}
