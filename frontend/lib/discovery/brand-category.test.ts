import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FAVORITE_BRAND_TO_CATEGORIES,
  categoriesForFavoriteBrand,
} from "./brand-category.ts";
import { FAVORITE_BRAND_OPTIONS } from "../onboard-profile.ts";

describe("favorite brand → brand category mapping", () => {
  it("covers every onboarding option exactly", () => {
    assert.deepEqual(
      Object.keys(FAVORITE_BRAND_TO_CATEGORIES).sort(),
      [...FAVORITE_BRAND_OPTIONS].sort(),
    );
  });

  it("maps each option to the agreed categories", () => {
    assert.deepEqual(categoriesForFavoriteBrand("Restaurants & Food"), ["restaurant"]);
    assert.deepEqual(categoriesForFavoriteBrand("Retail & Apparel"), ["retail"]);
    assert.deepEqual(categoriesForFavoriteBrand("Beauty & Personal Care"), ["retail"]);
    assert.deepEqual(categoriesForFavoriteBrand("Tech & Gadgets"), ["retail"]);
    assert.deepEqual(categoriesForFavoriteBrand("Travel & Hospitality"), ["hotel", "restaurant"]);
    assert.deepEqual(categoriesForFavoriteBrand("Entertainment & Media"), ["sports"]);
    assert.deepEqual(categoriesForFavoriteBrand("Fitness & Wellness"), ["sports"]);
    assert.deepEqual(categoriesForFavoriteBrand("Other"), []);
  });

  it("is tolerant of case/whitespace and empty for unknown or missing", () => {
    assert.deepEqual(categoriesForFavoriteBrand("  restaurants & food "), ["restaurant"]);
    assert.deepEqual(categoriesForFavoriteBrand(null), []);
    assert.deepEqual(categoriesForFavoriteBrand(undefined), []);
    assert.deepEqual(categoriesForFavoriteBrand("Something else"), []);
  });

  it("returns a fresh array each call", () => {
    const a = categoriesForFavoriteBrand("Travel & Hospitality");
    a.push("retail");
    assert.deepEqual(categoriesForFavoriteBrand("Travel & Hospitality"), ["hotel", "restaurant"]);
  });
});
