import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const foundingSrc = readFileSync(
  fileURLToPath(new URL("./founding.ts", import.meta.url)),
  "utf8",
);
const stripeHelpers = readFileSync(
  fileURLToPath(new URL("./stripe-helpers.ts", import.meta.url)),
  "utf8",
);
const brandPage = readFileSync(
  fileURLToPath(new URL("../app/brands/[slug]/page.tsx", import.meta.url)),
  "utf8",
);
const foundersPage = readFileSync(
  fileURLToPath(new URL("../app/brands/[slug]/founders/page.tsx", import.meta.url)),
  "utf8",
);
const premiumPage = readFileSync(
  fileURLToPath(new URL("../app/premium/page.tsx", import.meta.url)),
  "utf8",
);
const premiumActions = readFileSync(
  fileURLToPath(new URL("../app/premium/actions.ts", import.meta.url)),
  "utf8",
);
const webhook = readFileSync(
  fileURLToPath(new URL("../app/api/stripe/webhook/route.ts", import.meta.url)),
  "utf8",
);
const onboard = readFileSync(
  fileURLToPath(new URL("../app/api/member-engage/onboard/route.ts", import.meta.url)),
  "utf8",
);

describe("Founding 100 is free first-join, not Premium", () => {
  it("counts is_founder only — never subscription_tier / Stripe", () => {
    assert.match(foundingSrc, /is_founder/);
    assert.doesNotMatch(foundingSrc, /subscription_tier/);
    assert.doesNotMatch(foundingSrc, /\.in\(/);
    assert.match(foundingSrc, /getFoundingClaims/);
  });

  it("brand founders, /premium, and checkout share getFoundingClaims", () => {
    assert.match(brandPage, /getFoundingClaims/);
    assert.match(foundersPage, /getFoundingClaims/);
    assert.match(premiumPage, /getFoundingClaims/);
    assert.match(stripeHelpers, /getFoundingClaims/);
    assert.doesNotMatch(
      stripeHelpers,
      /\.in\("subscription_tier",\s*\["premium"/,
    );
  });

  it("Premium checkout always uses standard prices; founding is claimed on join", () => {
    assert.match(premiumActions, /asFounder = false/);
    assert.match(onboard, /claimFreeFoundingOnJoin/);
    assert.doesNotMatch(webhook, /claim_founder_slot/);
  });

  it("copy separates free Founding 100 from paid Premium", () => {
    assert.match(foundersPage, /free first 100|first 100 who join/i);
    assert.match(premiumPage, /separate paid|\$10|\$99/i);
    assert.doesNotMatch(premiumPage, /Founding Member pricing/);
    assert.doesNotMatch(foundersPage, /first \{founderCap\} paying members/);
  });
});
