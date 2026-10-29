// Maps the onboarding "favorite brand" category (FAVORITE_BRAND_OPTIONS in
// lib/onboard-profile.ts, stored in members.favorite_brand) onto the
// brands.category enum (migration 0024). Pure — no imports — so the node
// test runner can load it directly and the recommender stays side-effect
// free.

import type { BrandCategory } from "../../components/brand-directory-helpers.ts";

export type { BrandCategory };

/** Keys mirror FAVORITE_BRAND_OPTIONS exactly; keep both lists in sync. */
export const FAVORITE_BRAND_TO_CATEGORIES: Record<string, BrandCategory[]> = {
  "Restaurants & Food": ["restaurant"],
  "Retail & Apparel": ["retail"],
  "Beauty & Personal Care": ["retail"],
  "Tech & Gadgets": ["retail"],
  "Travel & Hospitality": ["hotel", "restaurant"],
  "Entertainment & Media": ["sports"],
  "Fitness & Wellness": ["sports"],
  Other: [],
};

/**
 * Brand categories implied by a member's favorite-brand answer. Unknown or
 * empty answers map to no categories (so nothing is boosted). Matching is
 * whitespace- and case-tolerant since the value is free text in the DB.
 */
export function categoriesForFavoriteBrand(
  favoriteBrand: string | null | undefined,
): BrandCategory[] {
  if (!favoriteBrand) return [];
  const wanted = favoriteBrand.trim().toLowerCase();
  for (const [key, cats] of Object.entries(FAVORITE_BRAND_TO_CATEGORIES)) {
    if (key.toLowerCase() === wanted) return [...cats];
  }
  return [];
}
