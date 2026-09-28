import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const migration = read("../../supabase/migrations/0059_points_integrity.sql");
const onboard = read("../app/api/member-engage/onboard/route.ts");
const checkins = read("./data/checkins.ts");
const checkinRoute = read("../app/api/checkin/route.ts");
const award = read("./points/award.ts");
const challenges = read("../app/admin/challenges/actions.ts");

describe("0059 points integrity migration", () => {
  it("adds a member-scoped ledger unique index, not a global one", () => {
    assert.match(
      migration,
      /create unique index if not exists points_ledger_member_source_ref_unique\s+on public\.points_ledger \(member_id, community_id, source, source_ref\)\s+where source_ref is not null/,
    );
    assert.doesNotMatch(migration, /on public\.points_ledger \(source_ref\)/);
  });

  it("keeps one referral row per referred member", () => {
    assert.match(
      migration,
      /create unique index if not exists referrals_referred_unique\s+on public\.referrals \(referred_id\)\s+where referred_id is not null/,
    );
  });

  it("removes member self-insert on referrals and checkins", () => {
    assert.match(migration, /drop policy if exists referrals_self_insert on public\.referrals/);
    assert.match(
      migration,
      /drop policy if exists "Members can insert own checkins" on public\.checkins/,
    );
    assert.match(migration, /revoke insert on table public\.checkins from authenticated/);
  });

  it("requires check-ins to reference a real brand", () => {
    assert.match(
      migration,
      /foreign key \(brand_slug\) references public\.brands \(slug\)/,
    );
  });
});

describe("onboard referral payout", () => {
  it("claims the referral with a plain insert, not an upsert", () => {
    assert.doesNotMatch(onboard, /from\("referrals"\)\.upsert/);
    assert.match(onboard, /from\("referrals"\)\.insert\(/);
  });

  it("pays nothing when the referral already exists", () => {
    const fn = onboard.slice(onboard.indexOf("async function claimReferral"));
    const claim = fn.indexOf('from("referrals").insert(');
    const bail = fn.indexOf("if (referralErr) {");
    const ledger = fn.indexOf('from("points_ledger").insert(');
    assert.ok(claim > 0 && bail > claim && ledger > bail);
    assert.match(fn.slice(bail, ledger), /return;/);
  });

  it("moves the total only when the ledger row was written", () => {
    const fn = onboard.slice(onboard.indexOf("async function claimReferral"));
    assert.match(fn, /if \(!ledgerErr\) \{\s+await addMemberPoints\(admin, referrerId, REFERRAL_POINTS\);/);
  });
});

describe("check-in integrity", () => {
  it("rejects an unknown brand before writing", () => {
    const lookup = checkins.indexOf('.from("brands")');
    const insert = checkins.indexOf('.from("checkins").insert(');
    assert.ok(lookup > 0 && lookup < insert);
    assert.match(checkins, /unknownBrand: true/);
    assert.match(checkinRoute, /result\.unknownBrand[\s\S]*status: 404/);
  });

  it("treats a same-day duplicate as already checked in", () => {
    assert.match(
      checkins,
      /checkinErr\.code === "23505"\) \{\s+return \{ ok: true, alreadyCheckedIn: true, pointsAwarded: 0 \}/,
    );
  });

  it("moves totals only when the ledger insert succeeded", () => {
    assert.match(checkins, /if \(!ledgerErr\) \{/);
    assert.doesNotMatch(checkins, /existingPts/);
  });
});

describe("other ledger writers", () => {
  it("awardPoints writes member_id and stops on a ledger error", () => {
    assert.doesNotMatch(award, /fan_id:/);
    assert.match(award, /member_id: memberId/);
    assert.match(award, /if \(ledgerErr\) \{[\s\S]*?return;/);
  });

  it("challenge winner bonus goes through awardPoints with a source_ref", () => {
    assert.match(challenges, /awardPoints\(supa, \{/);
    assert.match(challenges, /sourceRef: `challenge_winner:\$\{postId\}:\$\{memberId\}`/);
  });
});
