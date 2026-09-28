import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const migration = read("../../../supabase/migrations/0060_cancel_redemption.sql");
const helper = read("./cancel.ts");
const adminRedemptions = read("../../app/admin/redemptions/actions.ts");
const adminRewards = read("../../app/admin/rewards/actions.ts");
const redemptionButton = read("../../app/admin/redemptions/redemption-action.tsx");
const redemptionsPage = read("../../app/admin/redemptions/page.tsx");

const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} missing`);
  return src.slice(start, src.indexOf("\n}\n", start));
};

const sqlBody = migration.slice(
  migration.indexOf("create or replace function public.cancel_redemption"),
);

describe("0060 cancel_redemption", () => {
  it("locks the redemption row and requires pending", () => {
    assert.match(sqlBody, /from public\.reward_redemptions\s+where id = p_redemption_id\s+for update/);
    assert.match(sqlBody, /if v_redemption\.status <> 'pending' then/);
  });

  it("checks the caller's community when one is given", () => {
    assert.match(
      sqlBody,
      /p_community_id is not null\s+and v_redemption\.community_id is distinct from p_community_id/,
    );
  });

  it("refunds the stored cost once, to the brand, with no multiplier", () => {
    assert.match(
      sqlBody,
      /v_redemption\.point_cost,\s+'reward_redemption',\s+'redemption:' \|\| p_redemption_id \|\| ':refund',\s+v_community/,
    );
    assert.doesNotMatch(sqlBody, /multiplier|apply_points_award/);
  });

  it("puts the points back on both the member and the brand membership", () => {
    assert.match(sqlBody, /update public\.members\s+set total_points = coalesce\(total_points, 0\) \+ v_redemption\.point_cost/);
    assert.match(sqlBody, /public\.bump_membership_points\(\s*v_redemption\.member_id, v_community, v_redemption\.point_cost/);
  });

  it("allows only one refund row per redemption", () => {
    assert.match(
      migration,
      /create unique index if not exists points_ledger_redemption_refund_unique\s+on public\.points_ledger \(source_ref\)\s+where source_ref like 'redemption:%:refund'/,
    );
  });

  it("is callable by the service role only", () => {
    assert.match(migration, /revoke all on function public\.cancel_redemption\(uuid, text\) from public, anon, authenticated/);
    assert.match(migration, /grant execute on function public\.cancel_redemption\(uuid, text\) to service_role/);
  });
});

describe("cancel actions", () => {
  it("helper calls the RPC and never takes a point cost", () => {
    const body = fnBody(helper, "cancelRedemption");
    assert.match(body, /admin\.rpc\("cancel_redemption"/);
    assert.doesNotMatch(body, /pointCost|point_cost|total_points/);
  });

  for (const [label, src] of [
    ["admin redemptions", adminRedemptions],
    ["admin rewards", adminRewards],
  ] as const) {
    it(`${label} cancel goes through cancelRedemption only`, () => {
      const body = fnBody(src, "cancelRedemptionAction");
      assert.match(body, /export async function cancelRedemptionAction\(redemptionId: string\)/);
      assert.match(body, /cancelRedemption\(createAdminClient\(\), redemptionId, scope\)/);
      assert.doesNotMatch(body, /pointCost|memberId|total_points|points_ledger/);
    });

    it(`${label} cancel scopes non-super admins to their brand`, () => {
      const body = fnBody(src, "cancelRedemptionAction");
      assert.match(body, /const scope = ctx\.isSuperAdmin \? null : ctx\.currentCommunityId;/);
      assert.match(body, /if \(!ctx\.isSuperAdmin && !scope\)/);
    });
  }

  it("the Refund button no longer sends a member id or point cost", () => {
    assert.match(redemptionButton, /cancelRedemptionAction\(redemptionId\)/);
    assert.doesNotMatch(redemptionButton, /pointCost|memberId/);
    assert.doesNotMatch(redemptionsPage, /pointCost=|memberId=/);
  });
});
