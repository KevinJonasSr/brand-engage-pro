import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  billingBanner,
  brandSubscriptionPatch,
  invoiceOutcomeStatus,
  brandIdFromMetadata,
  graceDaysLeft,
  hasLiveSubscription,
  isBrandBillingLocked,
  isLockedAdminWritePath,
  mapStripeStatusToBrand,
  nextFreeSlot,
  nextPastDueSince,
  shouldOfferTrial,
  type BrandBillingRow,
} from "./brand-billing.ts";

const NOW = new Date("2026-10-11T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

function row(overrides: Partial<BrandBillingRow> = {}): BrandBillingRow {
  return {
    community_id: "acme",
    plan: "standard",
    free_slot: null,
    status: "active",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    trial_ends_at: null,
    current_period_end: null,
    cancel_at_period_end: false,
    past_due_since: null,
    trial_used: true,
    ...overrides,
  };
}

describe("isBrandBillingLocked", () => {
  it("never locks a brand with no billing row", () => {
    assert.equal(isBrandBillingLocked(null, NOW), false);
  });

  it("never locks a free-slot brand, whatever the status says", () => {
    assert.equal(isBrandBillingLocked(row({ plan: "free", free_slot: 1, status: "canceled" }), NOW), false);
  });

  it("does not lock pending, trialing, active or incomplete brands", () => {
    for (const status of ["pending", "trialing", "active", "incomplete"] as const) {
      assert.equal(isBrandBillingLocked(row({ status }), NOW), false, status);
    }
  });

  it("locks unpaid and canceled brands", () => {
    assert.equal(isBrandBillingLocked(row({ status: "unpaid" }), NOW), true);
    assert.equal(isBrandBillingLocked(row({ status: "canceled" }), NOW), true);
  });

  it("keeps a past-due brand writable during the 14-day grace", () => {
    assert.equal(isBrandBillingLocked(row({ status: "past_due", past_due_since: daysAgo(13) }), NOW), false);
  });

  it("locks a past-due brand once 14 days have passed", () => {
    assert.equal(isBrandBillingLocked(row({ status: "past_due", past_due_since: daysAgo(14) }), NOW), true);
  });

  it("does not lock past due with no start time recorded", () => {
    assert.equal(isBrandBillingLocked(row({ status: "past_due", past_due_since: null }), NOW), false);
  });
});

describe("graceDaysLeft", () => {
  it("counts down from 14", () => {
    assert.equal(graceDaysLeft(row({ status: "past_due", past_due_since: daysAgo(4) }), NOW), 10);
    assert.equal(graceDaysLeft(row({ status: "past_due", past_due_since: daysAgo(20) }), NOW), 0);
  });

  it("is null when not past due", () => {
    assert.equal(graceDaysLeft(row({ status: "active" }), NOW), null);
  });
});

describe("mapStripeStatusToBrand", () => {
  it("maps known Stripe statuses", () => {
    assert.equal(mapStripeStatusToBrand("trialing"), "trialing");
    assert.equal(mapStripeStatusToBrand("active"), "active");
    assert.equal(mapStripeStatusToBrand("past_due"), "past_due");
    assert.equal(mapStripeStatusToBrand("unpaid"), "unpaid");
    assert.equal(mapStripeStatusToBrand("incomplete_expired"), "canceled");
    assert.equal(mapStripeStatusToBrand("paused"), "canceled");
  });

  it("treats unknown statuses as canceled", () => {
    assert.equal(mapStripeStatusToBrand("something_new"), "canceled");
  });
});

describe("nextPastDueSince", () => {
  it("stamps now when a brand first goes past due", () => {
    assert.equal(nextPastDueSince(row({ status: "active" }), "past_due", NOW), NOW.toISOString());
  });

  it("keeps the original stamp on repeat past-due events", () => {
    const first = daysAgo(5);
    assert.equal(nextPastDueSince(row({ status: "past_due", past_due_since: first }), "past_due", NOW), first);
  });

  it("clears once the brand recovers", () => {
    assert.equal(nextPastDueSince(row({ status: "past_due", past_due_since: daysAgo(5) }), "active", NOW), null);
  });
});

describe("shouldOfferTrial / hasLiveSubscription", () => {
  it("offers the trial only once", () => {
    assert.equal(shouldOfferTrial(null), true);
    assert.equal(shouldOfferTrial({ trial_used: false }), true);
    assert.equal(shouldOfferTrial({ trial_used: true }), false);
  });

  it("detects a live paid subscription", () => {
    assert.equal(hasLiveSubscription(row({ status: "trialing" })), true);
    assert.equal(hasLiveSubscription(row({ status: "canceled" })), false);
    assert.equal(hasLiveSubscription(row({ stripe_subscription_id: null })), false);
    assert.equal(hasLiveSubscription(row({ plan: "free", free_slot: 2 })), false);
    assert.equal(hasLiveSubscription(null), false);
  });
});

describe("nextFreeSlot", () => {
  it("returns the lowest open slot", () => {
    assert.equal(nextFreeSlot([]), 1);
    assert.equal(nextFreeSlot([1, 2, 4, null]), 3);
  });

  it("returns null when all 10 are taken", () => {
    assert.equal(nextFreeSlot([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), null);
  });
});

describe("brandIdFromMetadata", () => {
  it("reads brand subscriptions only", () => {
    assert.equal(brandIdFromMetadata({ billing_scope: "brand", community_id: "acme" }), "acme");
    assert.equal(brandIdFromMetadata({ community_id: "acme", member_id: "m1" }), null);
    assert.equal(brandIdFromMetadata({ billing_scope: "brand", community_id: " " }), null);
    assert.equal(brandIdFromMetadata(null), null);
  });
});

describe("billingBanner", () => {
  it("is silent for free and healthy brands", () => {
    assert.equal(billingBanner(null, NOW), null);
    assert.equal(billingBanner(row({ plan: "free", free_slot: 1 }), NOW), null);
    assert.equal(billingBanner(row({ status: "active" }), NOW), null);
  });

  it("warns during the grace period and goes red once locked", () => {
    assert.equal(billingBanner(row({ status: "past_due", past_due_since: daysAgo(13) }), NOW)?.tone, "warning");
    assert.equal(billingBanner(row({ status: "unpaid" }), NOW)?.tone, "danger");
  });

  it("shows the trial end date", () => {
    const banner = billingBanner(row({ status: "trialing", trial_ends_at: "2026-11-10T00:00:00.000Z" }), NOW);
    assert.equal(banner?.tone, "info");
    assert.match(banner?.message ?? "", /November 10, 2026/);
  });
});

describe("isLockedAdminWritePath", () => {
  it("blocks admin pages but keeps billing and the brand switcher open", () => {
    assert.equal(isLockedAdminWritePath("/admin/offers"), true);
    assert.equal(isLockedAdminWritePath("/admin"), true);
    assert.equal(isLockedAdminWritePath("/admin/billing"), false);
    assert.equal(isLockedAdminWritePath("/admin/communities"), false);
    assert.equal(isLockedAdminWritePath("/admin/billingx"), true);
    assert.equal(isLockedAdminWritePath("/rewards"), false);
  });
});

describe("brandSubscriptionPatch", () => {
  const sub = {
    id: "sub_9",
    status: "trialing",
    customerId: "cus_9",
    trialEnd: Date.parse("2026-11-10T00:00:00.000Z") / 1000,
    periodEndIso: "2026-11-10T00:00:00.000Z",
    cancelAtPeriodEnd: false,
  };

  it("never touches a free-slot brand", () => {
    assert.equal(brandSubscriptionPatch(sub, row({ plan: "free", free_slot: 1 }), NOW), null);
  });

  it("records a new trial and marks the trial as used", () => {
    const patch = brandSubscriptionPatch(sub, null, NOW);
    assert.equal(patch?.status, "trialing");
    assert.equal(patch?.plan, "standard");
    assert.equal(patch?.trial_used, true);
    assert.equal(patch?.trial_ends_at, "2026-11-10T00:00:00.000Z");
    assert.equal(patch?.stripe_customer_id, "cus_9");
  });

  it("keeps the first past-due stamp", () => {
    const first = daysAgo(3);
    const patch = brandSubscriptionPatch(
      { ...sub, status: "past_due", trialEnd: null },
      row({ status: "past_due", past_due_since: first, trial_used: true }),
      NOW,
    );
    assert.equal(patch?.past_due_since, first);
    assert.equal(patch?.trial_used, true);
  });
});

describe("invoiceOutcomeStatus", () => {
  it("does not turn a trial into active on the $0 trial invoice", () => {
    assert.equal(invoiceOutcomeStatus("trialing", "paid"), "trialing");
  });

  it("recovers past due and unpaid brands when an invoice is paid", () => {
    assert.equal(invoiceOutcomeStatus("past_due", "paid"), "active");
    assert.equal(invoiceOutcomeStatus("unpaid", "paid"), "active");
  });

  it("starts past due on a failed payment, except for canceled brands", () => {
    assert.equal(invoiceOutcomeStatus("active", "failed"), "past_due");
    assert.equal(invoiceOutcomeStatus("canceled", "failed"), "canceled");
    assert.equal(invoiceOutcomeStatus("unpaid", "failed"), "unpaid");
  });
});
