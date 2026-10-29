// Regression tests for the 2026-10-29 member experience audit, sprint 2,
// track E: Nellie's assumptions no longer leak into shared member pages.
// Source-level assertions follow the pattern in member-audit-sprint1.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("member audit sprint 2 — brand-neutral shared pages", () => {
  it("/events lists events across followed brands, not a hardcoded Nellie's brand", () => {
    const src = read("../app/events/page.tsx");
    assert.doesNotMatch(src, /getBrandFromDb\(NELLIES_BRAND_SLUG\)/);
    assert.doesNotMatch(src, /encodeURIComponent\("\/brands\/nellies#upcoming"\)/);
    assert.doesNotMatch(src, /href="\/brands\/nellies/);
    assert.match(src, /listBrandsFromDb\(\)/);
    assert.match(src, /from\("member_brand_following"\)/);
    assert.match(src, /\/brands\/\$\{brand\.slug\}#upcoming/);
    // Nellie's offers render only when Nellie's is among the shown brands.
    assert.match(src, /b\.slug === NELLIES_BRAND_SLUG/);
    assert.match(src, /showsNellies \? nelliesPublicOffers/);
  });

  it("/rewards gates every Nellie's sentence on the viewer being at Nellie's", () => {
    const src = read("../app/rewards/page.tsx");
    assert.doesNotMatch(src, /`At Nellie's: \$\{nelliesSummary\}`/);
    assert.doesNotMatch(src, /`At Nellie's: \$\{nelliesPitch\}`/);
    assert.doesNotMatch(src, /At Nellie&apos;s, you earn from visits/);
    assert.match(src, /viewerFollowsBrand\(NELLIES_BRAND_SLUG\)/);
    // Every literal "Nellie's" string sits on the truthy side of an
    // `atNellies ?` ternary (the line starting with `? \``).
    const literalLines = src
      .split("\n")
      .filter((l) => /Nellie(&apos;|')s/.test(l) && !/^\s*(\/\/|\*|\/\*\*)/.test(l));
    assert.ok(literalLines.length > 0);
    for (const line of literalLines) {
      assert.match(line, /^\s*\? `At Nellie's/, `unguarded Nellie's copy: ${line.trim()}`);
    }
  });

  it("/marketplace tolerates a null community and gates Nellie's copy on the slug", () => {
    const src = read("../app/marketplace/page.tsx");
    assert.match(src, /getCurrentCommunityIdOrNull\(\)/);
    assert.doesNotMatch(src, /`At Nellie's: \$\{nelliesSummary\}`/);
    assert.match(src, /const atNellies = communityId === NELLIES_BRAND_SLUG/);
    assert.match(src, /communityId \? `\/brands\/\$\{communityId\}\/rewards` : "\/brands"/);
    assert.doesNotMatch(src, /href="\/brands\/jonas-group-ent\/rewards"/);
  });

  it("the signed-out PreviewSignupBanner contract is unchanged on /rewards and /marketplace", () => {
    for (const rel of ["../app/rewards/page.tsx", "../app/marketplace/page.tsx"]) {
      const src = read(rel);
      assert.match(src, /\{!isSignedIn && \(\s*<PreviewSignupBanner/);
      for (const prop of ["eyebrow", "headline", "body", "bullets", "primaryCta", "nextPath", "firstRewardLine"]) {
        assert.match(src, new RegExp(`\\b${prop}=`), `${rel} missing ${prop}`);
      }
    }
  });

  it("lib/community.ts no longer defaults unknown hosts to Nellie's", () => {
    const src = read("./community.ts");
    assert.doesNotMatch(src, /DEFAULT_COMMUNITY_ID = "nellies"/);
    assert.doesNotMatch(src, /\?\? "nellies"/);
    assert.match(src, /export const UNRESOLVED_COMMUNITY_ID = ""/);
    assert.match(src, /export async function getCurrentCommunityIdOrNull\(\): Promise<string \| null>/);
    assert.match(src, /export async function getCurrentCommunityId\(\): Promise<string>/);
    assert.match(src, /from\("brands"\)[\s\S]*\.eq\("active", true\)[\s\S]*\.order\("sort_order"\)[\s\S]*\.limit\(1\)/);
  });

  it("lib/points/award.ts never falls back to Nellie's", () => {
    const src = read("./points/award.ts");
    assert.doesNotMatch(src, /"nellies"/);
    assert.match(src, /\.order\("joined_at", \{ ascending: true \}\)/);
    assert.match(src, /communityId: string \| null;/);
  });

  it("/me birthday row copy is brand-neutral", () => {
    const src = read("../app/me/page.tsx");
    assert.doesNotMatch(src, /Nellie's birthday entr/);
  });

  it("/me/anniversaries reads member_anniversary_log, not the Member Engage fan table", () => {
    const src = read("../app/me/anniversaries/page.tsx");
    assert.doesNotMatch(src, /fan_anniversary_log|artist_slug|fan_id/);
    assert.match(src, /from\("member_anniversary_log"\)/);
    assert.match(src, /brand_slug/);
    const sql = read("../../supabase/migrations/0071_baseline_prod_only_tables.sql");
    assert.match(sql, /create table if not exists public\.member_anniversary_log/);
    assert.match(sql, /brand_slug text not null/);
  });

  it("the PWA manifest categories match a food-and-loyalty app", () => {
    const manifest = JSON.parse(read("../public/manifest.json")) as { categories: string[] };
    assert.deepEqual(manifest.categories, ["food", "lifestyle", "shopping"]);
  });
});
