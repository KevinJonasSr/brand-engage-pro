import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

/** Source of one exported function, up to the next top-level export. */
const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `${name} not found`);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
};

const offers = read("../app/admin/offers/actions.ts");
const offersPage = read("../app/admin/offers/page.tsx");
const community = read("../app/admin/community/actions.ts");
const migration = read(
  "../../supabase/migrations/0063_offers_require_brand.sql",
);
const policies = read("../app/admin/policies/actions.ts");
const predictionsActions = read(
  "../app/brands/[slug]/community/predictions-actions.ts",
);
const brandCommunityActions = read(
  "../app/brands/[slug]/community/actions.ts",
);
const broadcastPage = read("../app/admin/broadcast/page.tsx");

describe("offers are always brand-scoped", () => {
  it("createOfferAction resolves the brand and writes community_id", () => {
    const body = fnBody(offers, "createOfferAction");
    assert.match(body, /resolveWriteBrand\(\s*ctx,/);
    assert.match(body, /community_id: communityId,/);
  });

  it("image and active updates are filtered to the admin's brand", () => {
    for (const name of ["updateOfferImageAction", "toggleOfferActiveAction"]) {
      const body = fnBody(offers, name);
      assert.match(body, /adminScope\(await requireAdminContext\(\)\)/, name);
      assert.match(
        body,
        /if \(scope\) query = query\.eq\("community_id", scope\);/,
        name,
      );
    }
  });

  it("the offers page filters its list by brand", () => {
    assert.match(offersPage, /\.eq\("community_id", access\.scope\)/);
  });
});

describe("0063 migration", () => {
  it("carries the already-applied header", () => {
    assert.match(
      migration,
      /Already applied to production via MCP on \d{4}-\d{2}-\d{2}\./,
    );
  });

  it("drops the old fork default on offers.community_id", () => {
    assert.match(
      migration,
      /alter table public\.offers alter column community_id drop default;/,
    );
  });

  it("does no data writes", () => {
    assert.doesNotMatch(migration, /^\s*(update|delete|insert)\b/im);
  });
});

describe("member suspension is brand-scoped", () => {
  const body = fnBody(community, "adminSuspendMemberAction");

  it("only super-admins touch the global members.suspended flag", () => {
    assert.match(
      body,
      /if \(scope === null\) \{\s*await admin\s*\.from\("members"\)\s*\.update\(\{ suspended: suspend \}\)/,
    );
  });

  it("brand admins update their own brand's membership row", () => {
    assert.match(body, /\.from\("member_community_memberships"\)/);
    assert.match(body, /\.eq\("community_id", scope\)/);
    assert.match(body, /\.eq\("member_id", memberId\)/);
  });

  it("refuses to suspend a member outside the admin's brand", () => {
    assert.match(body, /throw new AdminScopeError\(\)/);
  });

  it("restoring never promotes a pending member", () => {
    assert.match(body, /if \(!suspend\) query = query\.eq\("status", "suspended"\);/);
  });
});

describe("policy edits are super-admin only", () => {
  it("the shared guard requires a super-admin", () => {
    assert.match(
      policies,
      /async function requireAdmin\(\) \{\s*const ctx = await requireAdminContext\(\);\s*requireSuperAdmin\(ctx\);/,
    );
  });

  it("every exported policy action goes through that guard", () => {
    const names = [...policies.matchAll(/export async function (\w+)/g)].map(
      (m) => m[1],
    );
    assert.ok(names.length > 0);
    for (const name of names) {
      assert.match(fnBody(policies, name), /await requireAdmin\(\)/, name);
    }
  });
});

describe("prediction actions check the brand", () => {
  it("create refuses a brand the admin does not hold", () => {
    const body = fnBody(predictionsActions, "createPredictionAction");
    assert.match(body, /canAccessBrand\(ctx, brandSlug\)/);
  });

  it("resolve checks the stored post's brand before awarding", () => {
    const body = fnBody(predictionsActions, "resolvePredictionAction");
    const check = body.indexOf("canAccessBrand(ctx, scopeBrand)");
    const award = body.indexOf("resolveAndAwardPrediction(");
    assert.ok(check > 0 && award > check, "brand check must come first");
  });
});

describe("brand community admin actions check the brand", () => {
  it("poll, challenge and announcement creation call canAccessBrand", () => {
    for (const name of [
      "createPollAction",
      "createChallengeAction",
      "createAnnouncementAction",
    ]) {
      assert.match(
        fnBody(brandCommunityActions, name),
        /canAccessBrand\(ctx, brandSlug\)/,
        name,
      );
    }
  });

  it("admin delete and pin go through the stored post's brand", () => {
    for (const name of ["deletePostAction", "togglePinAction"]) {
      assert.match(
        fnBody(brandCommunityActions, name),
        /adminCanActOnPost\(ctx, postId\)/,
        name,
      );
    }
  });

  it("new community posts set community_id to the brand", () => {
    const inserts = brandCommunityActions.match(/brand_slug: brandSlug,/g) ?? [];
    const withCommunity =
      brandCommunityActions.match(
        /brand_slug: brandSlug,\s*community_id: brandSlug,/g,
      ) ?? [];
    assert.ok(inserts.length > 0);
    assert.equal(withCommunity.length, inserts.length);
  });
});

describe("broadcast page", () => {
  it("no longer hardcodes a brand", () => {
    assert.doesNotMatch(broadcastPage, /value="nellies"/);
  });
});
