import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const migration = read("../../supabase/migrations/0061_atomic_member_points.sql");
const award = read("./points/award.ts");
const onboard = read("../app/api/member-engage/onboard/route.ts");
const challenges = read("../app/admin/challenges/actions.ts");

const fnBody = (src: string, name: string) => {
  const start = src.indexOf(name);
  assert.ok(start >= 0, `${name} not found`);
  return src.slice(start);
};

describe("0061 add_member_points", () => {
  it("adds to members.total_points in one update", () => {
    assert.match(
      migration,
      /update members\s+set total_points = coalesce\(total_points, 0\) \+ p_delta\s+where id = p_member_id;/,
    );
  });

  it("hands the per-brand total to bump_membership_points", () => {
    assert.match(
      migration,
      /perform bump_membership_points\(p_member_id, p_community_id, p_delta\);/,
    );
  });

  it("is callable by the service role only", () => {
    assert.match(migration, /security definer/);
    assert.match(migration, /set search_path = public/);
    assert.match(
      migration,
      /revoke all on function public\.add_member_points\(uuid, integer, text\) from public, anon, authenticated;/,
    );
    assert.match(
      migration,
      /grant execute on function public\.add_member_points\(uuid, integer, text\) to service_role;/,
    );
  });
});

describe("awardPoints", () => {
  it("moves totals through the atomic rpc, not read-then-write", () => {
    assert.match(award, /admin\.rpc\("add_member_points", \{/);
    assert.match(award, /p_community_id: communityId/);
    assert.doesNotMatch(award, /\.select\("total_points"\)/);
    assert.doesNotMatch(award, /total_points:/);
  });

  it("calls the rpc only after the ledger insert succeeded", () => {
    const bail = award.indexOf("if (ledgerErr) {");
    const rpc = award.indexOf('rpc("add_member_points"');
    assert.ok(bail > 0 && rpc > bail);
  });
});

describe("onboarding bonuses", () => {
  it("no longer reads the total before writing it", () => {
    assert.doesNotMatch(onboard, /getTotal/);
    assert.doesNotMatch(onboard, /total_points: newTotal/);
  });

  it("pays the signup bonus only when its ledger row was written", () => {
    const fn = fnBody(onboard, "const { error: bonusErr }");
    assert.match(
      fn,
      /if \(bonusErr\) \{[\s\S]*?\} else \{\s+await addMemberPoints\(admin, user\.id, SIGNUP_BONUS_POINTS\);/,
    );
  });

  it("addMemberPoints uses the atomic rpc", () => {
    const fn = fnBody(onboard, "async function addMemberPoints");
    assert.match(fn, /admin\.rpc\("add_member_points", \{/);
  });
});

describe("pickWinnerAction brand scope", () => {
  const fn = fnBody(challenges, "export async function pickWinnerAction");

  it("uses the admin context and rejects an admin with no brand", () => {
    assert.match(fn, /const ctx = await getAdminContext\(\);/);
    assert.match(fn, /const scope = ctx\.isSuperAdmin \? null : ctx\.currentCommunityId;/);
    assert.match(fn, /if \(!ctx\.isSuperAdmin && !scope\) return;/);
  });

  it("checks the post's brand before writing anything", () => {
    const check = fn.indexOf("if (scope && brandSlug !== scope) return;");
    const firstWrite = fn.indexOf('from("campaign_items").insert(');
    assert.ok(check > 0 && firstWrite > check);
  });

  it("requires the entry to belong to that post and member", () => {
    const entry = fn.indexOf('.from("community_challenge_entries")');
    const firstWrite = fn.indexOf('from("campaign_items").insert(');
    assert.ok(entry > 0 && entry < firstWrite);
    assert.match(fn, /\.eq\("post_id", postId\)\s+\.eq\("member_id", memberId\)/);
  });

  it("credits the bonus to the post's brand", () => {
    assert.match(fn, /communityId: brandSlug/);
    assert.doesNotMatch(fn, /\.update\(\{ total_points:/);
  });
});
