"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext, getAdminCommunityId, roleAtLeast } from "@/lib/admin";
import { getStripe } from "@/lib/stripe";
import { resolveAppUrl } from "@/lib/site-url";
import { readBrandBilling } from "@/lib/brand-billing-server";
import {
  BRAND_BILLING_SCOPE,
  BRAND_TRIAL_DAYS,
  hasLiveSubscription,
  nextFreeSlot,
  shouldOfferTrial,
} from "@/lib/brand-billing";

const BILLING_PATH = "/admin/billing";

/** Owners and admins manage billing. Editors and viewers cannot. */
async function requireBillingManager() {
  const ctx = await getAdminContext();
  if (!ctx) redirect(`/login?next=${BILLING_PATH}`);
  if (!ctx.isSuperAdmin && !roleAtLeast(ctx.role, "admin")) redirect("/admin");
  const communityId = await getAdminCommunityId();
  return { ctx, communityId };
}

/** Stripe customer for the brand, created once and kept on brand_billing. */
async function brandCustomerId(
  communityId: string,
  email: string,
  existing: string | null,
): Promise<string> {
  if (existing) return existing;
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: { billing_scope: BRAND_BILLING_SCOPE, community_id: communityId },
  });
  const admin = createAdminClient();
  const { error } = await admin.from("brand_billing").upsert(
    { community_id: communityId, stripe_customer_id: customer.id },
    { onConflict: "community_id" },
  );
  if (error) throw new Error(`brand_billing customer save failed: ${error.message}`);
  return customer.id;
}

/**
 * Start the $50/month plan through Stripe Checkout. Card is always taken up
 * front; the first subscription gets a 30-day trial. If the card is missing
 * when the trial ends, Stripe cancels instead of billing.
 */
export async function startBrandCheckoutAction() {
  const { ctx, communityId } = await requireBillingManager();
  const priceId = process.env.STRIPE_BRAND_PRICE_ID;
  if (!priceId) {
    console.warn("billing: STRIPE_BRAND_PRICE_ID is not set");
    redirect(`${BILLING_PATH}?error=not-configured`);
  }

  const admin = createAdminClient();
  const row = await readBrandBilling(admin, communityId);
  if (row?.plan === "free") redirect(`${BILLING_PATH}?error=free`);
  if (hasLiveSubscription(row)) redirect(`${BILLING_PATH}?error=already-active`);

  const customerId = await brandCustomerId(
    communityId,
    ctx.user.email ?? "",
    row?.stripe_customer_id ?? null,
  );
  const origin = resolveAppUrl();
  const metadata = { billing_scope: BRAND_BILLING_SCOPE, community_id: communityId };

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_collection: "always",
    client_reference_id: `brand:${communityId}`,
    metadata,
    subscription_data: {
      metadata,
      ...(shouldOfferTrial(row)
        ? {
            trial_period_days: BRAND_TRIAL_DAYS,
            trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          }
        : {}),
    },
    success_url: `${origin}${BILLING_PATH}?started=1`,
    cancel_url: `${origin}${BILLING_PATH}?canceled=1`,
  });

  if (!session.url) throw new Error("Stripe returned no Checkout URL");
  redirect(session.url);
}

/** Open the Stripe customer portal to change card, see invoices, or cancel. */
export async function openBrandPortalAction() {
  const { communityId } = await requireBillingManager();
  const row = await readBrandBilling(createAdminClient(), communityId);
  if (!row?.stripe_customer_id) redirect(`${BILLING_PATH}?error=no-customer`);

  const portal = await getStripe().billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${resolveAppUrl()}${BILLING_PATH}`,
  });
  redirect(portal.url);
}

/**
 * Super admin only: put the current brand in one of the 10 free slots.
 * Refuses a brand that already has a live paid subscription, so nobody is
 * charged and free at the same time.
 */
export async function grantFreeSlotAction() {
  const { ctx, communityId } = await requireBillingManager();
  if (!ctx.isSuperAdmin) redirect(BILLING_PATH);

  const admin = createAdminClient();
  const row = await readBrandBilling(admin, communityId);
  if (row?.plan === "free") redirect(BILLING_PATH);
  if (hasLiveSubscription(row)) redirect(`${BILLING_PATH}?error=already-active`);

  const { data: taken, error: takenError } = await admin
    .from("brand_billing")
    .select("free_slot")
    .eq("plan", "free");
  if (takenError) throw new Error(`free slot lookup failed: ${takenError.message}`);

  const slot = nextFreeSlot((taken ?? []).map((t) => t.free_slot as number | null));
  if (slot === null) redirect(`${BILLING_PATH}?error=slots-full`);

  const { error } = await admin.from("brand_billing").upsert(
    {
      community_id: communityId,
      plan: "free",
      free_slot: slot,
      status: "active",
      past_due_since: null,
    },
    { onConflict: "community_id" },
  );
  if (error) throw new Error(`free slot grant failed: ${error.message}`);

  revalidatePath("/admin", "layout");
  redirect(`${BILLING_PATH}?granted=${slot}`);
}
