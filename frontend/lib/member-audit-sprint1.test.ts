// Regression tests for the 2026-10-29 member experience audit, sprint 1.
// Source-level assertions follow the pattern in first-session.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { applyNelliesLaunchEvents } from "./nellies-launch.ts";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("member audit sprint 1", () => {
  it("RSVP confirmation reads brand_events, not the Member Engage artist_events table", () => {
    const src = read("./notifications/triggers/rsvp-confirmation.ts");
    assert.doesNotMatch(src, /from\("artist_events"\)/);
    assert.match(src, /from\("brand_events"\)/);
  });

  it("Member Home copy says events, not shows, and 'a brand' not 'an brand'", () => {
    const src = read("../components/member-home-dashboard.tsx");
    assert.doesNotMatch(src, /upcoming shows/i);
    assert.doesNotMatch(src, /"[^"]*\ban brand\b[^"]*"/);
  });

  it("Member Home no longer pins Nellie's upcoming events to Bourbon & Cigar Night", () => {
    const src = read("./data/member-home.ts");
    assert.doesNotMatch(src, /return isBourbonCigarTitle\(e\.title\);/);
    assert.match(src, /spendablePoints/);
  });

  it("the Spend-your-points card renders ledger points, not members.total_points", () => {
    const src = read("../components/member-home-dashboard.tsx");
    assert.match(src, /points=\{spendablePoints\}/);
    assert.doesNotMatch(src, /points=\{member\.total_points\}/);
  });

  it("the stale Bourbon & Cigar Night date is gone from /rewards and /marketplace", () => {
    for (const rel of ["../app/rewards/page.tsx", "../app/marketplace/page.tsx"]) {
      assert.doesNotMatch(read(rel), /September 23/);
    }
  });

  it("the home page no longer renders a static 'No events scheduled yet' panel", () => {
    assert.doesNotMatch(read("../app/page.tsx"), /No events scheduled yet/);
  });

  it("Marketplace is off the main nav until it is a real catalog", () => {
    const src = read("../app/layout.tsx");
    assert.doesNotMatch(src, /\{ href: "\/marketplace", label: "Marketplace" \}/);
  });

  it("leaderboards exclude members flagged is_test", () => {
    const src = read("./leaderboard/gather.ts");
    assert.match(src, /is_test/);
    assert.match(src, /testMemberIds/);
  });

  it("Nellie's events retire once ends_at passes even with no starts_at", () => {
    const now = new Date("2026-10-29T04:00:00.000Z");
    const events = applyNelliesLaunchEvents(
      "nellies",
      [
        { id: "t", title: "Trunk or Treat", active: true, ends_at: "2026-10-25T02:00:00.000Z" },
        { id: "f", title: "Friendsgiving", active: true, starts_at: "2026-11-20T23:00:00.000Z" },
        { id: "u", title: "Date TBA Supper", active: true },
      ],
      now,
    );
    assert.deepEqual(
      events.map((e) => e.title),
      ["Friendsgiving", "Date TBA Supper"],
    );
  });

  it("migration 0080 retires Trunk or Treat, fixes tier badge copy, adds members.is_test", () => {
    const sql = read("../../supabase/migrations/0080_member_audit_data_fixes.sql");
    assert.match(sql, /title = 'Trunk or Treat'/);
    assert.match(sql, /Crossed into Silver — 750 pts/);
    assert.match(sql, /Reached Gold — 3,500 pts/);
    assert.match(sql, /Platinum unlocked — 8,000 pts/);
    assert.match(sql, /add column if not exists is_test/);
  });
});

describe("follow = join", () => {
  it("onboarding joins and follows the brand the member came from, not a hardcoded Nellie's", () => {
    const src = read("../app/api/member-engage/onboard/route.ts");
    assert.match(src, /resolveHomeBrand\(/);
    assert.match(src, /from\("member_brand_following"\)\.upsert/);
    assert.doesNotMatch(src, /community_id: "nellies",\n\s*status: "active"/);
    assert.match(src, /brandSlug: payload\.brandSlug/);
  });

  it("the onboarding client sends brandSlug from ?brand=", () => {
    const src = read("../app/onboarding/onboarding-client.tsx");
    assert.match(src, /get\("brand"\)/);
    assert.match(src, /brandSlug: brandFromUrl/);
  });

  it("brand join CTAs use ?brand= and readers accept ?ref= for old links", () => {
    assert.match(read("../app/brands/[slug]/page.tsx"), /\/signup\?brand=\$\{brand\.slug\}/);
    assert.match(read("../app/signup/page.tsx"), /sp\.brand \?\? sp\.ref/);
    assert.match(read("../app/signup/signup-client.tsx"), /get\("brand"\) \?\? ref/);
  });

  it("migration 0081 syncs memberships and following both ways and backfills", () => {
    const sql = read("../../supabase/migrations/0081_follow_join_sync.sql");
    assert.match(sql, /trg_sync_following_from_membership/);
    assert.match(sql, /trg_sync_membership_from_following/);
    assert.match(sql, /insert into public\.member_brand_following[\s\S]*from public\.member_community_memberships/);
    assert.match(sql, /insert into public\.member_community_memberships[\s\S]*from public\.member_brand_following/);
  });
});
