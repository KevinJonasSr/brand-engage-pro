import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  sumLedgerDeltas,
  sumPositiveLedgerDeltas,
  tierProgress,
} from "./member-points.ts";

const memberSrc = readFileSync(
  fileURLToPath(new URL("./member.ts", import.meta.url)),
  "utf8",
);
const typesSrc = readFileSync(
  fileURLToPath(new URL("./types.ts", import.meta.url)),
  "utf8",
);
const migration0082 = readFileSync(
  fileURLToPath(
    new URL("../../../supabase/migrations/0082_lifetime_points_tier.sql", import.meta.url),
  ),
  "utf8",
);
const rewardsPage = readFileSync(
  fileURLToPath(new URL("../../app/rewards/page.tsx", import.meta.url)),
  "utf8",
);
const brandRewards = readFileSync(
  fileURLToPath(new URL("../../app/brands/[slug]/rewards/page.tsx", import.meta.url)),
  "utf8",
);

describe("spendable points source of truth", () => {
  it("sums every ledger delta including adjustments", () => {
    // Lyra walk: welcome +25 + RSVP +10 = 35
    assert.equal(
      sumLedgerDeltas([
        { delta: 25 },
        { delta: 10 },
      ]),
      35,
    );
    assert.equal(sumLedgerDeltas([{ delta: 25 }, { delta: 10 }, { delta: 5 }]), 40);
    assert.equal(sumLedgerDeltas([{ delta: 40 }, { delta: -5 }]), 35);
    assert.equal(sumLedgerDeltas([]), 0);
    assert.equal(sumLedgerDeltas([{ delta: null }, { delta: undefined }]), 0);
  });

  it("KPIs, breakdown, and brand rewards all read the ledger helper", () => {
    assert.match(memberSrc, /getSpendablePoints/);
    assert.match(memberSrc, /sumLedgerDeltas/);
    assert.match(memberSrc, /from\("points_ledger"\)/);
    assert.match(rewardsPage, /getCurrentMemberKpis/);
    assert.match(rewardsPage, /getPointBreakdown/);
    assert.match(rewardsPage, /breakdownTotal/);
    assert.match(brandRewards, /getSpendablePoints/);
    assert.doesNotMatch(brandRewards, /select\("total_points"\)/);
  });
});

describe("tier follows lifetime points, spending never demotes", () => {
  const TIERS = [
    { slug: "gold", min_points: 3500 },
    { slug: "bronze", min_points: 0 },
    { slug: "platinum", min_points: 8000 },
    { slug: "silver", min_points: 750 },
  ];

  it("lifetime sums only positive deltas", () => {
    // Earned 800, redeemed 300: wallet 500, lifetime 800.
    const rows = [{ delta: 500 }, { delta: 300 }, { delta: -300 }];
    assert.equal(sumLedgerDeltas(rows), 500);
    assert.equal(sumPositiveLedgerDeltas(rows), 800);
    assert.equal(sumPositiveLedgerDeltas([{ delta: null }, { delta: -5 }]), 0);
  });

  it("a Silver member who redeems is still N pts to Gold, not back to Silver", () => {
    const earned = 800;
    const spent = 300;
    const spendable = earned - spent;
    const fromSpendable = tierProgress(TIERS, spendable);
    assert.equal(fromSpendable.next_tier?.slug, "silver", "old behaviour demoted");
    const fromLifetime = tierProgress(TIERS, earned);
    assert.equal(fromLifetime.next_tier?.slug, "gold");
    assert.equal(fromLifetime.points_to_next_tier, 3500 - 800);
    assert.deepEqual(tierProgress(TIERS, 9000), { next_tier: null, points_to_next_tier: null });
    assert.equal(tierProgress(TIERS, 0).next_tier?.slug, "silver");
  });

  it("KPIs report the wallet and compute tier progress from lifetime", () => {
    assert.match(memberSrc, /export async function getLifetimePoints/);
    assert.match(memberSrc, /\.gt\("delta", 0\)/);
    assert.match(memberSrc, /select\("lifetime_points"\)/);
    assert.match(memberSrc, /sumPositiveLedgerDeltas/);
    assert.match(memberSrc, /getLifetimePoints\(user\.id\)/);
    assert.match(memberSrc, /tierProgress\(tiers, lifetime\)/);
    assert.match(memberSrc, /spendable_points: total_points/);
    assert.match(memberSrc, /lifetime_points: lifetime/);
    assert.doesNotMatch(memberSrc, /min_points > total_points/);
    // Type stays backward compatible: fields added, none renamed.
    for (const field of ["total_points", "spendable_points", "lifetime_points", "referral_count", "badge_count", "next_tier", "points_to_next_tier"]) {
      assert.match(typesSrc, new RegExp(`^  ${field}:`, "m"), field);
    }
  });

  it("migration 0082 adds lifetime_points, moves both tier triggers onto it, keeps the enum", () => {
    assert.match(migration0082, /alter table public\.members\s+add column if not exists lifetime_points integer not null default 0/);
    assert.match(migration0082, /alter table public\.member_community_memberships\s+add column if not exists lifetime_points integer not null default 0/);
    assert.match(migration0082, /create or replace function public\.update_member_tier\(\)/);
    assert.match(migration0082, /create or replace function public\.update_membership_tier\(\)/);
    assert.match(migration0082, /before insert or update of total_points, lifetime_points on public\.members/);
    assert.match(migration0082, /before insert or update of total_points, lifetime_points on public\.member_community_memberships/);
    assert.match(migration0082, /where min_points <= coalesce\(new\.lifetime_points, 0\)/);
    assert.doesNotMatch(migration0082, /min_points <= coalesce\(new\.total_points/);
    // Promote only.
    assert.match(migration0082, /if v_cur_min is null or v_new_min > v_cur_min then/);
    // Backfill from positive ledger deltas, floored at balance and current tier.
    assert.match(migration0082, /where delta > 0/);
    assert.match(migration0082, /coalesce\(t\.min_points, 0\)/);
    // bump_membership_points keeps its signature and no longer sets tier itself.
    assert.match(migration0082, /create or replace function public\.bump_membership_points\(p_member_id uuid, p_community_id text, p_delta int\)/);
    assert.doesNotMatch(migration0082, /alter type/i);
    assert.match(migration0082, /notify pgrst, 'reload schema'/);
  });
});
