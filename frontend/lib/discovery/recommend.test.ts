import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestBrands } from "./recommend.ts";

const roster = [
  { slug: "a-retail-nyc", name: "A", category: "retail", city: "New York, NY", followerCount: 50 },
  { slug: "b-rest-belmont", name: "B", category: "restaurant", city: "Belmont, NC", followerCount: 5 },
  { slug: "c-hotel-vegas", name: "C", category: "hotel", city: "Las Vegas", followerCount: 90 },
  { slug: "d-retail-belmont", name: "D", category: "retail", city: "belmont", followerCount: 1 },
  { slug: "e-rest-nyc", name: "E", category: "restaurant", city: "New York", followerCount: 20 },
  { slug: "f-sports-null", name: "F", category: "sports", city: null, followerCount: 999 },
];

describe("suggestBrands", () => {
  it("excludes followed brands and caps at 3", () => {
    const out = suggestBrands({
      allActiveBrands: roster,
      followedSlugs: ["f-sports-null", "c-hotel-vegas"],
    });
    assert.equal(out.length, 3);
    assert.ok(!out.some((b) => b.slug === "f-sports-null" || b.slug === "c-hotel-vegas"));
  });

  it("ranks same city, then category match, then follower count, then directory order", () => {
    const out = suggestBrands({
      allActiveBrands: roster,
      followedSlugs: [],
      favoriteBrand: "Restaurants & Food",
      memberCity: "Belmont",
    });
    // Same-city + category (B) beats same-city only (D) beats category-only
    // with the most followers (E over nothing else restaurant).
    assert.deepEqual(
      out.map((b) => b.slug),
      ["b-rest-belmont", "d-retail-belmont", "e-rest-nyc"],
    );
    assert.deepEqual(out[0].reasons, { sameCity: true, categoryMatch: true });
    assert.deepEqual(out[1].reasons, { sameCity: true, categoryMatch: false });
    assert.deepEqual(out[2].reasons, { sameCity: false, categoryMatch: true });
  });

  it("falls back to follower count then original order without city/favorite", () => {
    const out = suggestBrands({ allActiveBrands: roster, followedSlugs: [] });
    assert.deepEqual(out.map((b) => b.slug), ["f-sports-null", "c-hotel-vegas", "a-retail-nyc"]);
  });

  it("treats missing follower counts as ties and keeps directory order", () => {
    const noCounts = roster.map((b) => ({ slug: b.slug, name: b.name, category: b.category, city: b.city }));
    const out = suggestBrands({ allActiveBrands: noCounts, followedSlugs: [], limit: 2 });
    assert.deepEqual(out.map((b) => b.slug), ["a-retail-nyc", "b-rest-belmont"]);
  });

  it("'Travel & Hospitality' boosts both hotels and restaurants", () => {
    const out = suggestBrands({
      allActiveBrands: roster,
      followedSlugs: [],
      favoriteBrand: "Travel & Hospitality",
    });
    assert.deepEqual(out.map((b) => b.slug), ["c-hotel-vegas", "e-rest-nyc", "b-rest-belmont"]);
  });

  it("returns an empty list when everything is followed or roster is empty", () => {
    assert.deepEqual(suggestBrands({ allActiveBrands: [], followedSlugs: [] }), []);
    assert.deepEqual(
      suggestBrands({ allActiveBrands: roster, followedSlugs: roster.map((b) => b.slug) }),
      [],
    );
  });
});
