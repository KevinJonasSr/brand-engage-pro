import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HOST_STAND_LOCKED_MESSAGE,
  HOST_STAND_TRY_AGAIN_MESSAGE,
  hostStandDisplayDecision,
  stripeBrandBillingConfigured,
} from "./brand-billing.ts";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const paid = {
  plan: "standard" as const,
  status: "active" as const,
  past_due_since: null,
  free_slot: null,
};

describe("hostStandDisplayDecision", () => {
  it("leaves Nellie's slot 1 and jonas-group-ent slot 2 open even if status is canceled", () => {
    for (const free_slot of [1, 2]) {
      assert.deepEqual(
        hostStandDisplayDecision({
          isSuperAdmin: false,
          lookupFailed: false,
          stripeConfigured: true,
          row: { ...paid, plan: "free", status: "canceled", free_slot },
        }),
        { allow: true },
      );
    }
  });

  it("does not lock a brand with no billing row", () => {
    assert.deepEqual(
      hostStandDisplayDecision({
        isSuperAdmin: false,
        lookupFailed: false,
        stripeConfigured: true,
        row: null,
      }),
      { allow: true },
    );
  });

  it("asks to try again when the lookup fails and Stripe is configured", () => {
    assert.deepEqual(
      hostStandDisplayDecision({
        isSuperAdmin: false,
        lookupFailed: true,
        stripeConfigured: true,
        row: null,
      }),
      { allow: false, status: 503, message: HOST_STAND_TRY_AGAIN_MESSAGE },
    );
  });

  it("stays open when the lookup fails and Stripe is not configured", () => {
    assert.deepEqual(
      hostStandDisplayDecision({
        isSuperAdmin: false,
        lookupFailed: true,
        stripeConfigured: false,
        row: null,
      }),
      { allow: true },
    );
  });

  it("blocks a locked paid brand and lets a super-admin through", () => {
    const row = { ...paid, status: "canceled" as const };
    assert.equal(
      hostStandDisplayDecision({
        isSuperAdmin: false,
        lookupFailed: false,
        stripeConfigured: true,
        row,
      }).allow,
      false,
    );
    assert.equal(
      hostStandDisplayDecision({
        isSuperAdmin: false,
        lookupFailed: false,
        stripeConfigured: true,
        row,
      }).allow
        ? ""
        : HOST_STAND_LOCKED_MESSAGE,
      HOST_STAND_LOCKED_MESSAGE,
    );
    assert.deepEqual(
      hostStandDisplayDecision({
        isSuperAdmin: true,
        lookupFailed: true,
        stripeConfigured: true,
        row,
      }),
      { allow: true },
    );
  });
});

describe("stripeBrandBillingConfigured", () => {
  it("requires both Stripe env vars", () => {
    assert.equal(stripeBrandBillingConfigured({}), false);
    assert.equal(stripeBrandBillingConfigured({ STRIPE_SECRET_KEY: "sk" }), false);
    assert.equal(
      stripeBrandBillingConfigured({
        STRIPE_SECRET_KEY: "sk",
        STRIPE_BRAND_PRICE_ID: "price",
      }),
      true,
    );
  });
});

describe("rotating check-in wiring", () => {
  it("does not record a visit when the poster token is sign-up only", () => {
    const route = read("../app/api/checkin/route.ts");
    const body = route.slice(route.indexOf("export async function POST"));
    const gate = body.indexOf("!decision.awardPoints");
    const record = body.indexOf("recordCheckin(");
    assert.ok(gate > 0 && record > gate, "host-stand response returns before recordCheckin");
    assert.ok(body.indexOf("apiRateLimiter.check") < body.indexOf("checkinAccessDecision"));
    assert.match(route, /hostStandRequired: true/);
    assert.match(route, /require_rotating_checkin/);
    assert.doesNotMatch(route, /CHECKIN_SIGNING_SECRET\s*=/);
  });

  it("gates the host-stand API on brand access and the billing decision", () => {
    const route = read("../app/api/admin/checkin-qr/route.ts");
    assert.match(route, /hostStandBrandAccess/);
    assert.match(route, /signRotatingCheckinToken/);
    assert.doesNotMatch(route, /console\.(log|info|debug)/);
  });

  it("adds the setting as the next migration and leaves it off by default", () => {
    const sql = read("../../supabase/migrations/0078_rotating_checkin.sql");
    assert.match(sql, /add column if not exists require_rotating_checkin boolean not null default false/);
    assert.doesNotMatch(sql, /alter type/i);
    assert.doesNotMatch(sql, /0b6536f3/);
    assert.match(read("../app/admin/brands/actions.ts"), /require_rotating_checkin/);
    assert.match(read("../app/admin/brands/[slug]/edit-form.tsx"), /name="require_rotating_checkin"/);
    const example = read("../.env.example");
    assert.match(example, /Changing it invalidates every printed QR code/);
    assert.match(example, /CHECKIN_ROTATING_WINDOW_SECONDS/);
    assert.doesNotMatch(example, /MAILCHIMP_BROADCAST_ENABLED=1/);
  });
});
