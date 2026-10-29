import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  REFERRAL_QUALIFIED_POINTS,
  REFERRAL_WELCOME_POINTS,
  referralQualifiedSourceRef,
  referralWelcomeSourceRef,
  shouldQualifyReferral,
  type PendingReferral,
} from "./first-visit.ts";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const migration = read("../../../supabase/migrations/0086_referral_first_visit.sql");
const onboard = read("../../app/api/member-engage/onboard/route.ts");
const checkins = read("../data/checkins.ts");
const firstVisit = read("./first-visit.ts");
const referralsPage = read("../../app/referrals/page.tsx");
const homePage = read("../../app/page.tsx");

const pending: PendingReferral = {
  id: "ref-1",
  referrer_id: "alice",
  referred_id: "bob",
  community_id: "nellies",
  qualified_at: null,
};

describe("shouldQualifyReferral", () => {
  it("qualifies only on the member's first check-in ever", () => {
    assert.equal(shouldQualifyReferral(pending, 1), true);
    assert.equal(shouldQualifyReferral(pending, 0), false);
    assert.equal(shouldQualifyReferral(pending, 2), false);
    assert.equal(shouldQualifyReferral(pending, 7), false);
  });

  it("never re-qualifies a row that already carries qualified_at", () => {
    const done = { ...pending, qualified_at: "2026-10-29T12:00:00Z" };
    assert.equal(shouldQualifyReferral(done, 1), false);
  });

  it("does nothing for a member who was not referred", () => {
    assert.equal(shouldQualifyReferral(null, 1), false);
    assert.equal(shouldQualifyReferral(undefined, 1), false);
  });
});

describe("referral point amounts and source_refs", () => {
  it("pays 150 to the referrer and 50 to the friend", () => {
    assert.equal(REFERRAL_QUALIFIED_POINTS, 150);
    assert.equal(REFERRAL_WELCOME_POINTS, 50);
  });

  it("keys the welcome bonus by referred member and the payout by referral id", () => {
    assert.equal(referralWelcomeSourceRef("bob"), "referral-welcome:bob");
    assert.equal(referralQualifiedSourceRef("ref-1"), "referral-qualified:ref-1");
  });

  it("awards the referrer through awardPoints with source 'referral'", () => {
    assert.match(firstVisit, /source: "referral",\s+sourceRef: referralQualifiedSourceRef\(pending\.id\)/);
    assert.match(firstVisit, /memberId: pending\.referrer_id/);
  });

  it("claims qualified_at before paying, guarded on the null column", () => {
    const claim = firstVisit.indexOf('.is("qualified_at", null)');
    const pay = firstVisit.indexOf("await awardPoints(admin, {");
    assert.ok(claim > 0 && pay > claim);
    assert.match(firstVisit, /status: "verified"/);
  });
});

describe("onboard route: referral block pays the friend, not the referrer", () => {
  const fn = onboard.slice(onboard.indexOf("async function claimReferral"));

  it("records the referral as pending with no points yet", () => {
    assert.match(fn, /status: "pending",\s+points_awarded: 0,\s+referee_bonus_awarded_at:/);
    assert.doesNotMatch(fn, /status: "verified"/);
  });

  it("writes the welcome bonus ledger row for the referred member", () => {
    assert.match(
      fn,
      /member_id: referredId,\s+delta: REFERRAL_WELCOME_POINTS,\s+source: "referral_welcome",\s+source_ref: referralWelcomeSourceRef\(referredId\)/,
    );
    assert.match(fn, /if \(!ledgerErr\) \{\s+await addMemberPoints\(admin, referredId, REFERRAL_WELCOME_POINTS\);/);
  });

  it("no longer pays the referrer at signup", () => {
    assert.doesNotMatch(fn, /addMemberPoints\(admin, referrerId/);
    assert.doesNotMatch(fn, /member_id: referrerId/);
  });
});

describe("recordCheckin calls the first-visit hook non-blocking", () => {
  it("fires after the ledger award and before returning", () => {
    const award = checkins.indexOf("await awardPoints(admin, {");
    const hook = checkins.indexOf("void qualifyReferralOnFirstVisit(memberId, brandSlug)");
    const ret = checkins.indexOf("return { ok: true, alreadyCheckedIn: false, pointsAwarded };");
    assert.ok(award > 0 && hook > award && ret > hook);
    assert.match(checkins, /qualifyReferralOnFirstVisit\(memberId, brandSlug\)\.catch\(/);
    assert.doesNotMatch(checkins, /await qualifyReferralOnFirstVisit/);
  });
});

describe("0086 migration", () => {
  it("adds both timestamp columns idempotently", () => {
    assert.match(
      migration,
      /alter table public\.referrals\s+add column if not exists qualified_at timestamptz;/,
    );
    assert.match(
      migration,
      /alter table public\.referrals\s+add column if not exists referee_bonus_awarded_at timestamptz;/,
    );
  });

  it("does not touch the status type (text, no enum) and backfills old paid rows", () => {
    assert.doesNotMatch(migration, /alter type/i);
    assert.doesNotMatch(migration, /add constraint/i);
    assert.match(migration, /set qualified_at = coalesce\(verified_at, created_at\)\s+where status = 'verified'/);
  });
});

describe("member-facing copy", () => {
  const line = /Your friend gets 50 pts to start\. You get 150 pts after their first visit\./;
  it("referrals page and home invite card state both rewards", () => {
    assert.match(referralsPage, line);
    assert.match(homePage, line);
    assert.doesNotMatch(homePage, /Every verified join earns you 150 pts/);
    assert.doesNotMatch(referralsPage, /\+150 pts per signup/);
  });
});
