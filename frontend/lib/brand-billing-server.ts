import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscriptionPeriodEndIso } from "@/lib/stripe-moved-fields";
import {
  brandIdFromMetadata,
  brandSubscriptionPatch,
  invoiceOutcomeStatus,
  nextPastDueSince,
  type BrandBillingRow,
} from "@/lib/brand-billing";

/**
 * Stripe webhook side of brand billing (item 8). Brand subscriptions carry
 * metadata { billing_scope: "brand", community_id }. Fan Premium
 * subscriptions never do, so the two never touch each other's rows.
 */

const BILLING_COLUMNS =
  "community_id, plan, free_slot, status, stripe_customer_id, stripe_subscription_id, trial_ends_at, current_period_end, cancel_at_period_end, past_due_since, trial_used";

export async function readBrandBilling(
  admin: SupabaseClient,
  communityId: string,
): Promise<BrandBillingRow | null> {
  const { data, error } = await admin
    .from("brand_billing")
    .select(BILLING_COLUMNS)
    .eq("community_id", communityId)
    .maybeSingle();
  if (error) throw new Error(`brand_billing read failed: ${error.message}`);
  return (data as BrandBillingRow | null) ?? null;
}

/**
 * Handle customer.subscription.created/updated/deleted for a brand.
 * Returns false when the subscription is not a brand subscription, so the
 * caller can fall through to the fan Premium handlers.
 */
export async function handleBrandSubscriptionEvent(
  sub: Stripe.Subscription,
  admin: SupabaseClient,
): Promise<boolean> {
  const communityId = brandIdFromMetadata(sub.metadata);
  if (!communityId) return false;

  const previous = await readBrandBilling(admin, communityId);
  const customer = sub.customer;
  const patch = brandSubscriptionPatch(
    {
      id: sub.id,
      status: sub.status,
      customerId: typeof customer === "string" ? customer : customer?.id ?? null,
      trialEnd: sub.trial_end ?? null,
      periodEndIso: subscriptionPeriodEndIso(sub),
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    },
    previous,
  );
  if (!patch) {
    console.warn("brand billing: ignoring Stripe event for free-slot brand", communityId);
    return true;
  }

  const { error } = await admin
    .from("brand_billing")
    .upsert({ community_id: communityId, ...patch }, { onConflict: "community_id" });
  if (error) throw new Error(`brand_billing upsert failed: ${error.message}`);
  return true;
}

/**
 * Handle invoice.paid / invoice.payment_failed for a brand subscription.
 * Returns false when no brand owns the subscription.
 */
export async function handleBrandInvoiceEvent(
  subscriptionId: string,
  outcome: "paid" | "failed",
  admin: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await admin
    .from("brand_billing")
    .select(BILLING_COLUMNS)
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (error) throw new Error(`brand_billing read failed: ${error.message}`);
  const row = data as BrandBillingRow | null;
  if (!row) return false;
  if (row.plan === "free") return true;

  // subscription.updated carries the real status. Invoices only nudge it:
  // a paid invoice recovers a past-due brand (the $0 trial invoice must not
  // turn a trial into "active"), a failed one starts the grace clock.
  const status = invoiceOutcomeStatus(row.status, outcome);
  if (status === row.status) return true;
  const { error: updErr } = await admin
    .from("brand_billing")
    .update({ status, past_due_since: nextPastDueSince(row, status) })
    .eq("community_id", row.community_id);
  if (updErr) throw new Error(`brand_billing update failed: ${updErr.message}`);
  return true;
}
