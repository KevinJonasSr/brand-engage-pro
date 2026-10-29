// Sprint 2, track C: brand directory relationship chips, "My brands" on /me,
// and the Upcoming empty state. Pure-helper tests plus source-level
// assertions following the pattern in member-audit-sprint1.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildMyBrands,
  followLoginHref,
  followedSlugSet,
  followerCountsFromResults,
  tierLabel,
  upcomingEmptyCopy,
} from "../components/brand-directory-helpers.ts";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("brand directory helpers", () => {
  it("folds head-count results into a slug map and treats null as 0", () => {
    const counts = followerCountsFromResults([
      { slug: "a", count: 12 },
      { slug: "b", count: null },
      { slug: "c", count: 0 },
    ]);
    assert.deepEqual(counts, { a: 12, b: 0, c: 0 });
  });

  it("builds the followed set from own following rows", () => {
    const set = followedSlugSet([{ brand_slug: "a" }, { brand_slug: "a" }, { brand_slug: "b" }]);
    assert.equal(set.size, 2);
    assert.ok(set.has("a") && set.has("b"));
    assert.equal(followedSlugSet(null).size, 0);
  });

  it("login-gated follow returns to the directory by default", () => {
    assert.equal(followLoginHref(), "/login?next=%2Fbrands");
    assert.equal(followLoginHref("/brands/x#upcoming"), "/login?next=%2Fbrands%2Fx%23upcoming");
  });

  it("capitalises tier slugs and passes through null", () => {
    assert.equal(tierLabel("gold"), "Gold");
    assert.equal(tierLabel(null), null);
  });
});

describe("buildMyBrands", () => {
  const brands = [
    { slug: "a", name: "Brand A" },
    { slug: "b", name: "Brand B" },
    { slug: "c", name: "Brand C" },
  ];

  it("unions follows and memberships, keeps directory order, drops inactive brands", () => {
    const items = buildMyBrands(
      brands,
      [{ brand_slug: "c" }, { brand_slug: "gone" }],
      [{ community_id: "a", current_tier: "silver" }],
    );
    assert.deepEqual(
      items.map((i) => [i.slug, i.tier]),
      [["a", "silver"], ["c", null]],
    );
    assert.equal(items[0].href, "/brands/a");
    assert.equal(items[0].rewardsHref, "/brands/a/rewards");
    assert.equal(items[0].name, "Brand A");
  });

  it("returns an empty list for a member with no follows or memberships", () => {
    assert.deepEqual(buildMyBrands(brands, [], null), []);
  });
});

describe("upcoming empty copy", () => {
  it("asks non-followers to follow and reassures followers", () => {
    assert.match(upcomingEmptyCopy("Acme", false).body, /^Follow Acme to hear/);
    assert.match(upcomingEmptyCopy("Acme", true).body, /You follow Acme/);
    assert.equal(upcomingEmptyCopy("Acme", true).title, "No events on the calendar yet.");
  });
});

describe("source-level wiring", () => {
  it("/brands counts followers per brand with head:true and excludes test members", () => {
    const src = read("../app/brands/page.tsx");
    assert.match(src, /members!inner\(is_test\)/);
    assert.match(src, /count: "exact", head: true/);
    assert.match(src, /\.eq\("members\.is_test", false\)/);
    // No longer loads every following row.
    assert.doesNotMatch(src, /\.from\("member_brand_following"\)\s*\.select\("brand_slug"\);/);
  });

  it("/brands uses next/link for genre chips and the shared follow control", () => {
    const src = read("../app/brands/page.tsx");
    assert.doesNotMatch(src, /<a\s+href="\/brands"/);
    assert.doesNotMatch(src, /<a\s+key=\{g\}/);
    assert.match(src, /<Link\s+href="\/brands"/);
    assert.match(src, /BrandDirectoryFollow/);
    assert.match(src, /followed\.has\(a\.slug\)/);
  });

  it("the directory follow control reuses FollowButton rather than a new action", () => {
    const src = read("../components/brand-directory-follow.tsx");
    assert.match(src, /from "@\/app\/brands\/\[slug\]\/follow-button"/);
    assert.doesNotMatch(src, /toggleFollowAction/);
    assert.match(src, /followLoginHref\(next\)/);
  });

  it("/me renders My brands above the settings list with an Add more link", () => {
    const src = read("../app/me/page.tsx");
    assert.match(src, /<MyBrandsSection items=\{myBrands\} \/>\s*<ul className="space-y-3">/);
    assert.match(src, /from\("member_community_memberships"\)/);
    assert.match(src, /select\("community_id, current_tier"\)/);
    const section = read("../components/my-brands-section.tsx");
    assert.match(section, /href="\/brands"/);
    assert.match(section, /Add more/);
    assert.match(section, /haven\\u2019t joined a club yet|haven’t joined a club yet/);
  });

  it("the brand page shows an Upcoming empty state instead of an empty grid", () => {
    const src = read("../app/brands/[slug]/page.tsx");
    assert.match(src, /brand\.upcoming\.length === 0 && \(/);
    assert.match(src, /<BrandDirectoryUpcomingEmpty/);
    assert.match(src, /brand\.upcoming\.length > 0 && \(/);
    const empty = read("../components/brand-directory-upcoming-empty.tsx");
    assert.match(empty, /\{!isFollowing && \(/);
  });
});
