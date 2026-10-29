import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  anyBrandHasCoords,
  brandDirectoryHref,
  cityMatches,
  formatMiles,
  haversineMiles,
  isBrandCategory,
  normalizeCity,
  presentCategories,
  rankByDistance,
} from "../../components/brand-directory-helpers.ts";

describe("brand directory discovery helpers", () => {
  it("normalises cities for matching", () => {
    assert.equal(normalizeCity("Belmont, NC"), "belmont");
    assert.equal(normalizeCity("  New   York "), "new york");
    assert.equal(normalizeCity(null), "");
    assert.ok(cityMatches("Belmont, NC", "belmont"));
    assert.ok(cityMatches("St. Louis", "st louis, MO"));
    assert.ok(!cityMatches("Belmont", "Charlotte"));
    assert.ok(!cityMatches("", ""));
    assert.ok(!cityMatches(null, null));
  });

  it("computes haversine distance in miles", () => {
    // Charlotte ↔ Belmont, NC ≈ 12 mi
    const d = haversineMiles(35.2271, -80.8431, 35.2429, -81.0373);
    assert.ok(d > 10 && d < 13, `got ${d}`);
    assert.equal(haversineMiles(1, 2, 1, 2), 0);
  });

  it("formats miles with one decimal under 10", () => {
    assert.equal(formatMiles(0.44), "0.4 mi");
    assert.equal(formatMiles(2.26), "2.3 mi");
    assert.equal(formatMiles(18.4), "18 mi");
    assert.equal(formatMiles(NaN), "");
  });

  it("ranks brands by distance, skipping those without coords, and accepts numeric strings", () => {
    const origin = { lat: 35.2429, lng: -81.0373 }; // Belmont
    const ranked = rankByDistance(
      [
        { slug: "charlotte", lat: "35.2271", lng: "-80.8431" },
        { slug: "none", lat: null, lng: null },
        { slug: "belmont", lat: 35.2431, lng: -81.0370 },
        { slug: "half", lat: 35, lng: null },
      ],
      origin,
    );
    assert.deepEqual(ranked.map((r) => r.slug), ["belmont", "charlotte"]);
    assert.ok(ranked[0].miles < 0.1);
    assert.ok(anyBrandHasCoords([{ slug: "x", lat: "1", lng: "2" }]));
    assert.ok(!anyBrandHasCoords([{ slug: "x", lat: null, lng: "2" }]));
  });

  it("lists present categories in canonical order", () => {
    assert.deepEqual(
      presentCategories([
        { category: "hotel" },
        { category: "restaurant" },
        { category: null },
        { category: "restaurant" },
        { category: "bogus" },
      ]),
      ["restaurant", "hotel"],
    );
    assert.ok(isBrandCategory("retail"));
    assert.ok(!isBrandCategory("bogus"));
  });

  it("builds directory hrefs that preserve the other filters", () => {
    assert.equal(brandDirectoryHref({}), "/brands");
    assert.equal(brandDirectoryHref({ genre: "Country", near: true }), "/brands?genre=Country&near=1");
    assert.equal(
      brandDirectoryHref({ genre: "R&B", category: "restaurant" }),
      "/brands?genre=R%26B&category=restaurant",
    );
    assert.equal(brandDirectoryHref({ category: null, near: false }), "/brands");
  });
});
