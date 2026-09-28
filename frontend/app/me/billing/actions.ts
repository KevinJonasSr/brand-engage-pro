"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeOrNull } from "@/lib/stripe";

const BILLING_PATH = "/me/billing";

function getCanonicalOrigin(): string | null {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  return configured ? configured.replace(/\/$/, "") : null;
}

async function resolveOrigin(): Promise<string> {
  const canonical = getCanonicalOrigin();
  if (canonical) return canonical;
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? "brand-engage-pro.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * Open the Stripe customer portal so a member can update their card,
 * switch plans, or cancel Premium. Open to any signed-in member who has
 * a Stripe customer id, including past_due and cancelled members, so
 * nobody is locked out of cancelling or fixing a card.
 */
export async function openBillingPortalAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(BILLING_PATH)}`);

  const stripe = getStripeOrNull();
  if (!stripe) redirect(`${BILLING_PATH}?error=not_configured`);

  const admin = createAdminClient();
  const { data: member, error: memberErr } = await admin
    .from("members")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  if (memberErr) {
    console.error("billing portal: member lookup failed", memberErr.message);
    redirect(`${BILLING_PATH}?error=portal`);
  }

  const customerId = (member?.stripe_customer_id as string | null) ?? null;
  if (!customerId) redirect(`${BILLING_PATH}?error=no_customer`);

  const origin = await resolveOrigin();

  let portalUrl: string | null = null;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}${BILLING_PATH}`,
    });
    portalUrl = session.url;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("billing portal: session create failed", msg);
  }

  // redirect() throws, so it stays outside the try block above.
  if (!portalUrl) redirect(`${BILLING_PATH}?error=portal`);
  redirect(portalUrl);
}
