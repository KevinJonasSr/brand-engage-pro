import { test } from "node:test";
import assert from "node:assert/strict";
import { PREMIUM_SALES_OPEN, premiumClosedRedirect } from "./premium-sales.ts";

test("premium sales are closed for launch", () => {
  assert.equal(PREMIUM_SALES_OPEN, false);
});

test("closed premium page redirects to the brand page when a community is known", () => {
  assert.equal(premiumClosedRedirect("nellies"), "/brands/nellies");
});

test("closed premium page redirects to the brands list without a community", () => {
  assert.equal(premiumClosedRedirect(null), "/brands");
  assert.equal(premiumClosedRedirect(undefined), "/brands");
});
