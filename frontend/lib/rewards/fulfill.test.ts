import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const helper = read("./fulfill.ts");
const adminRedemptions = read("../../app/admin/redemptions/actions.ts");
const adminRewards = read("../../app/admin/rewards/actions.ts");

const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} missing`);
  return src.slice(start, src.indexOf("\n}\n", start));
};

describe("markRedemptionFulfilled helper", () => {
  const body = fnBody(helper, "markRedemptionFulfilled");

  it("only moves pending redemptions", () => {
    assert.match(body, /\.eq\("status", "pending"\)/);
  });

  it("filters on the caller's community unless super admin", () => {
    assert.match(body, /if \(communityId !== null\) query = query\.eq\("community_id", communityId\)/);
  });

  it("treats zero updated rows as an error", () => {
    assert.match(body, /if \(!data\) return \{ error:/);
  });
});

for (const [label, src] of [
  ["admin/redemptions", adminRedemptions],
  ["admin/rewards", adminRewards],
] as const) {
  describe(`${label} markFulfilledAction`, () => {
    const body = fnBody(src, "markFulfilledAction");

    it("scopes non super admins to their community", () => {
      assert.match(body, /const scope = ctx\.isSuperAdmin \? null : ctx\.currentCommunityId;/);
      assert.match(body, /if \(!ctx\.isSuperAdmin && !scope\) \{\s+return \{ error: "Unauthorized" \};/);
    });

    it("goes through the shared helper, not a raw update", () => {
      assert.match(body, /markRedemptionFulfilled\(/);
      assert.doesNotMatch(body, /\.update\(/);
    });
  });
}
