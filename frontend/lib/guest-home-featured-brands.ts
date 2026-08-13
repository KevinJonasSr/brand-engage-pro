import type { Brand } from "./brands";

/** Soft-hidden from guest featured tiles only. Brand pages and `/brands` stay live. */
const GUEST_HOME_HIDDEN_SLUGS = new Set(["jonas-group-ent"]);
const GUEST_HOME_HIDDEN_NAMES = new Set(["Jonas Group Entertainment"]);

export function isGuestHomeFeaturedBrand(brand: {
  slug: string;
  name: string;
}): boolean {
  return (
    !GUEST_HOME_HIDDEN_SLUGS.has(brand.slug) &&
    !GUEST_HOME_HIDDEN_NAMES.has(brand.name)
  );
}

/**
 * Guest `/` featured-brand tiles. Soft-hide only — callers must not use
 * this to 404 a brand page or drop a row from `listBrands()`.
 */
export function featuredBrandsForGuestHome(
  brands: Brand[],
  limit = 5,
): Brand[] {
  return brands.filter(isGuestHomeFeaturedBrand).slice(0, limit);
}
