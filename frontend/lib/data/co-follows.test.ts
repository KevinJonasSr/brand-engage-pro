import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { rankCoFollows, type CoFollowBrandRow } from "./co-follows.ts";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const brands: CoFollowBrandRow[] = [
  { slug: "nellies", name: "Nellie's", tagline: "Home.", city: "Belmont, NC", hero_image: null, active: true },
  { slug: "jonas-group-ent", name: "Jonas Group", tagline: null, city: "Nashville, TN", hero_image: "/h.png", active: true },
  { slug: "alpha", name: "Alpha", tagline: null, city: null, hero_image: null, active: true },
  { slug: "draft", name: "Draft Brand", tagline: null, city: null, hero_image: null, active: false },
];

describe("rankCoFollows", () => {
  it("counts distinct members per brand and orders by count", () => {
    const rows = [
      { member_id: "m1", brand_slug: "jonas-group-ent" },
      { member_id: "m2", brand_slug: "jonas-group-ent" },
      { member_id: "m2", brand_slug: "alpha" },
    ];
    const out = rankCoFollows("nellies", rows, brands);
    assert.deepEqual(
      out.map((b) => [b.slug, b.coFollowers]),
      [["jonas-group-ent", 2], ["alpha", 1]],
    );
    assert.equal(out[0].city, "Nashville, TN");
    assert.equal(out[0].heroImage, "/h.png");
  });

  it("excludes the source brand, inactive brands and unknown slugs", () => {
    const rows = [
      { member_id: "m1", brand_slug: "nellies" },
      { member_id: "m1", brand_slug: "draft" },
      { member_id: "m1", brand_slug: "ghost" },
      { member_id: "m1", brand_slug: "alpha" },
    ];
    const out = rankCoFollows("nellies", rows, brands);
    assert.deepEqual(out.map((b) => b.slug), ["alpha"]);
  });

  it("dedupes duplicate (member, brand) rows and breaks ties by name", () => {
    const rows = [
      { member_id: "m1", brand_slug: "jonas-group-ent" },
      { member_id: "m1", brand_slug: "jonas-group-ent" },
      { member_id: "m1", brand_slug: "alpha" },
    ];
    const out = rankCoFollows("nellies", rows, brands);
    assert.deepEqual(
      out.map((b) => [b.slug, b.coFollowers]),
      [["alpha", 1], ["jonas-group-ent", 1]],
    );
  });

  it("respects the limit and returns [] for no rows", () => {
    const rows = [
      { member_id: "m1", brand_slug: "jonas-group-ent" },
      { member_id: "m1", brand_slug: "alpha" },
    ];
    assert.equal(rankCoFollows("nellies", rows, brands, 1).length, 1);
    assert.deepEqual(rankCoFollows("nellies", rows, brands, 0), []);
    assert.deepEqual(rankCoFollows("nellies", [], brands), []);
  });
});

describe("getCoFollowedBrands query shape", () => {
  const src = read("./co-follows.ts");
  it("excludes QA accounts and inactive brands in the queries", () => {
    assert.match(src, /\.eq\("members\.is_test", false\)/);
    assert.match(src, /\.eq\("brands\.active", true\)/);
    assert.match(src, /\.neq\("brand_slug", brandSlug\)/);
  });
});

describe("migration 0087 brand location seed", () => {
  const sql = read("../../../supabase/migrations/0087_brand_locations_seed.sql");
  it("seeds Nellie's city, cuisine and approximate coordinates", () => {
    assert.match(sql, /set city = 'Belmont, NC'\s+where slug = 'nellies' and city is null/);
    assert.match(sql, /set cuisine = 'southern'\s+where slug = 'nellies' and cuisine is null/);
    assert.match(sql, /set lat = 35\.242600, lng = -81\.038000/);
    assert.match(sql, /approximate/i);
  });
  it("seeds only the city for Jonas Group and never overwrites admin edits", () => {
    assert.match(sql, /set city = 'Nashville, TN'\s+where slug = 'jonas-group-ent' and city is null/);
    assert.doesNotMatch(sql, /jonas-group-ent'[^;]*category/);
    for (const stmt of sql.split(";").filter((s) => /update public\.brands/.test(s))) {
      assert.match(stmt, /is null/, `unguarded update: ${stmt.trim()}`);
    }
  });
});
