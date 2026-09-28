import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_FORBIDDEN,
  AdminScopeError,
  adminScope,
  canAccessBrand,
  inScope,
  requireBrandAccess,
  requireSuperAdmin,
  resolveWriteBrand,
} from "./admin-scope.ts";

const superAdmin = {
  isSuperAdmin: true,
  communities: [],
  currentCommunityId: null,
};
const superWithPick = { ...superAdmin, currentCommunityId: "nellies" };
const nelliesAdmin = {
  isSuperAdmin: false,
  communities: ["nellies"],
  currentCommunityId: "nellies",
};
const noBrandAdmin = {
  isSuperAdmin: false,
  communities: [],
  currentCommunityId: null,
};
const staleCookieAdmin = {
  isSuperAdmin: false,
  communities: ["nellies"],
  currentCommunityId: "raelynn",
};

describe("canAccessBrand", () => {
  it("lets a super-admin into any brand", () => {
    assert.equal(canAccessBrand(superAdmin, "raelynn"), true);
  });

  it("lets a brand admin into their own brand only", () => {
    assert.equal(canAccessBrand(nelliesAdmin, "nellies"), true);
    assert.equal(canAccessBrand(nelliesAdmin, "raelynn"), false);
  });

  it("refuses a missing context or an empty brand", () => {
    assert.equal(canAccessBrand(null, "nellies"), false);
    assert.equal(canAccessBrand(superAdmin, ""), false);
    assert.equal(canAccessBrand(nelliesAdmin, "   "), false);
    assert.equal(canAccessBrand(nelliesAdmin, null), false);
  });

  it("trims the brand before comparing", () => {
    assert.equal(canAccessBrand(nelliesAdmin, " nellies "), true);
  });
});

describe("requireBrandAccess", () => {
  it("returns the cleaned brand when allowed", () => {
    assert.equal(requireBrandAccess(nelliesAdmin, " nellies"), "nellies");
  });

  it("throws AdminScopeError for another brand", () => {
    assert.throws(
      () => requireBrandAccess(nelliesAdmin, "raelynn"),
      (err: unknown) =>
        err instanceof AdminScopeError && err.message === ADMIN_FORBIDDEN,
    );
  });
});

describe("requireSuperAdmin", () => {
  it("passes for a super-admin", () => {
    assert.doesNotThrow(() => requireSuperAdmin(superAdmin));
  });

  it("throws for a brand admin or no context", () => {
    assert.throws(() => requireSuperAdmin(nelliesAdmin), AdminScopeError);
    assert.throws(() => requireSuperAdmin(null), AdminScopeError);
  });
});

describe("adminScope", () => {
  it("returns null (all brands) for a super-admin", () => {
    assert.equal(adminScope(superAdmin), null);
    assert.equal(adminScope(superWithPick), null);
  });

  it("returns the brand admin's own brand", () => {
    assert.equal(adminScope(nelliesAdmin), "nellies");
  });

  it("throws rather than running unfiltered when a brand admin has no brand", () => {
    assert.throws(() => adminScope(noBrandAdmin), AdminScopeError);
    assert.throws(() => adminScope(null), AdminScopeError);
  });

  it("throws when the current brand is not one the admin holds", () => {
    assert.throws(() => adminScope(staleCookieAdmin), AdminScopeError);
  });
});

describe("resolveWriteBrand", () => {
  it("always writes a brand admin's rows to their own brand", () => {
    assert.equal(resolveWriteBrand(nelliesAdmin, ""), "nellies");
    assert.equal(resolveWriteBrand(nelliesAdmin, "nellies"), "nellies");
  });

  it("rejects a brand admin asking for another brand", () => {
    assert.throws(
      () => resolveWriteBrand(nelliesAdmin, "raelynn"),
      AdminScopeError,
    );
  });

  it("uses the brand a super-admin picked explicitly", () => {
    assert.equal(resolveWriteBrand(superAdmin, "raelynn"), "raelynn");
    assert.equal(resolveWriteBrand(superWithPick, "raelynn"), "raelynn");
  });

  it("falls back to the super-admin's switcher pick", () => {
    assert.equal(resolveWriteBrand(superWithPick, ""), "nellies");
  });

  it("refuses a super-admin write with no brand at all", () => {
    assert.throws(
      () => resolveWriteBrand(superAdmin, ""),
      (err: unknown) =>
        err instanceof AdminScopeError && /Pick a brand/.test(err.message),
    );
  });

  it("refuses a missing context", () => {
    assert.throws(() => resolveWriteBrand(null, "nellies"), AdminScopeError);
  });
});

describe("inScope", () => {
  it("accepts every row when scope is null", () => {
    assert.equal(inScope(null, "raelynn"), true);
    assert.equal(inScope(null, null), true);
  });

  it("accepts only rows from the scoped brand", () => {
    assert.equal(inScope("nellies", "nellies"), true);
    assert.equal(inScope("nellies", "raelynn"), false);
    assert.equal(inScope("nellies", null), false);
  });
});
