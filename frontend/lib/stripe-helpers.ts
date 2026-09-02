import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { getFoundingClaims } from "@/lib/founding";

/**
 * Server-only helpers for the Stripe Checkout + subscription flow.
 */

/**
 * Get-or-create the Stripe Customer for a member. Caches the customer id on
 * `members.stripe_customer_id`. One customer per member, shared across every
 * community they subscribe to — matches Stripe's best practice for
 * multi-product, single-customer setups.
 */
export async function getOrCreateStripeCustomer(params: {
  memberId: string;
  email: string;
  firstName?: string | null;
}): Promise<string> {
  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("stripe_customer_id")
    .eq("id", params.memberId)
    .maybeSingle();

  const existing = member?.stripe_customer_id as string | null;
  if (existing) return existing;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: params.email,
    name: params.firstName ?? undefined,
    metadata: { member_id: params.memberId },
  });

  await admin
    .from("members")
    .update({ stripe_customer_id: customer.id })
    .eq("id", params.memberId);

  return customer.id;
}

export interface FounderState {
  founderCap: number;
  founderCount: number;
  slotsRemaining: number;
  isFull: boolean;
}

/**
 * Founding 100 counters. Delegates to getFoundingClaims — free first-100
 * joins (`is_founder`), never Stripe / premium subscription counts.
 * Premium checkout must not treat this as paid-founder eligibility.
 */
export async function getFounderState(communityId: string): Promise<FounderState> {
  const claims = await getFoundingClaims(communityId);
  return {
    founderCap: claims.cap,
    founderCount: claims.claimed,
    slotsRemaining: claims.remaining,
    isFull: claims.isFull,
  };
}

/**
 * Pick the right Stripe price_id for a given billing period + founder
 * eligibility. Returns null if the community isn't seeded yet.
 */
export function pickPriceId(
  community: {
    stripe_price_id_monthly: string | null;
    stripe_price_id_annual: string | null;
    stripe_price_id_founder_monthly: string | null;
    stripe_price_id_founder_annual: string | null;
  },
  billingPeriod: "monthly" | "annual",
  asFounder: boolean,
): string | null {
  if (asFounder) {
    return billingPeriod === "monthly"
      ? community.stripe_price_id_founder_monthly
      : community.stripe_price_id_founder_annual;
  }
  return billingPeriod === "monthly"
    ? community.stripe_price_id_monthly
    : community.stripe_price_id_annual;
}

/** `1000` cents → `"$10"`. */
export function fmtPrice(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
