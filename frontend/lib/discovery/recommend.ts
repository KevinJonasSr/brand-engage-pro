// "Brands you might like" — pure ranking for Member Home. No I/O; the data
// loader (lib/data/member-home.ts) feeds it the active brand roster and the
// member's follows / onboarding answers.

import { cityMatches } from "../../components/brand-directory-helpers.ts";
import { categoriesForFavoriteBrand } from "./brand-category.ts";

export type SuggestableBrand = {
  slug: string;
  name: string;
  tagline?: string | null;
  category?: string | null;
  city?: string | null;
  hero_image?: string | null;
  accent_from?: string | null;
  accent_to?: string | null;
  /** Optional; when omitted every brand ties on this key. */
  followerCount?: number | null;
};

export type SuggestBrandsInput<B extends SuggestableBrand> = {
  /** Active brands in directory order (sort_order). */
  allActiveBrands: B[];
  followedSlugs: Iterable<string>;
  /** members.favorite_brand — one of FAVORITE_BRAND_OPTIONS, or null. */
  favoriteBrand?: string | null;
  /** members.city, or null. */
  memberCity?: string | null;
  limit?: number;
};

export type SuggestedBrand<B extends SuggestableBrand> = B & {
  reasons: {
    sameCity: boolean;
    categoryMatch: boolean;
  };
};

/**
 * Up to `limit` (default 3) brands the member does not follow, ranked:
 *   1. same city as the member (case-insensitive, "Belmont, NC" == "Belmont")
 *   2. category matches the member's favorite-brand answer
 *   3. higher follower count
 *   4. directory order (stable)
 */
export function suggestBrands<B extends SuggestableBrand>({
  allActiveBrands,
  followedSlugs,
  favoriteBrand = null,
  memberCity = null,
  limit = 3,
}: SuggestBrandsInput<B>): Array<SuggestedBrand<B>> {
  const followed = new Set(followedSlugs);
  const wantedCategories = new Set<string>(categoriesForFavoriteBrand(favoriteBrand));

  const scored = allActiveBrands
    .filter((b) => !followed.has(b.slug))
    .map((b, index) => ({
      brand: b,
      index,
      sameCity: cityMatches(memberCity, b.city),
      categoryMatch: !!b.category && wantedCategories.has(b.category),
      followers: Math.max(0, b.followerCount ?? 0),
    }));

  scored.sort((a, b) => {
    if (a.sameCity !== b.sameCity) return a.sameCity ? -1 : 1;
    if (a.categoryMatch !== b.categoryMatch) return a.categoryMatch ? -1 : 1;
    if (a.followers !== b.followers) return b.followers - a.followers;
    return a.index - b.index;
  });

  return scored.slice(0, Math.max(0, limit)).map((s) => ({
    ...s.brand,
    reasons: { sameCity: s.sameCity, categoryMatch: s.categoryMatch },
  }));
}
