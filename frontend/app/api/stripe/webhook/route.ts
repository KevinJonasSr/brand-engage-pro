import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import {
  invoiceSubscriptionId,
  subscriptionPeriodEndIso,
} from "@/lib/stripe-moved-fields";
import {
  isStripeEventReplay,
  stripeEventCompletionPatch,
} from "@/lib/stripe-webhook-processed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook
 *
 * Stripe delivery endpoint. Every request is verified against
 * STRIPE_WEBHOOK_SECRET. Every event_id is recorded in stripe_events
 * for idempotency. processed_at is only stamped when the handler
 * succeeds, so a replay of a processed event is a no-op while a failed
 * event returns 500 and Stripe retries it. Handled events:
 *
 *   customer.subscription.created  → flip membership to 'premium'
 *                                    (Founding 100 is claimed on join, not here)
 *   customer.subscription.updated  → sync status (past_due / cancelled /
 *                                    active), period end, cancel-at-end
 *   customer.subscription.deleted  → revert to 'free', clear sub id
 *   invoice.paid                   → extend current_period_end, refresh
 *                                    $5 monthly credit if Premium
 *   invoice.payment_failed         → tier → 'past_due' (retry grace)
 *
 * Configure the endpoint in Stripe dashboard:
 *   URL:      https://<host>/api/stripe/webhook
 *   Events:   customer.subscription.*, invoice.paid, invoice.payment_failed
 *   Secret:   copy into STRIPE_WEBHOOK_SECRET in Vercel env vars.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("stripe/webhook: STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "webhook secret not configured" },
      { status: 500 },
    );
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  // Raw body is required for signature verification — don't parse as JSON.
  const body = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("stripe/webhook: signature verification failed", msg);
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Idempotency check — have we already processed this event?
  const { data: existing } = await admin
    .from("stripe_events")
    .select("id, processed_at")
    .eq("id", event.id)
    .maybeSingle();

  if (isStripeEventReplay(existing?.processed_at)) {
    return NextResponse.json({ ok: true, replay: true });
  }

  // Record the raw event (first sight). We'll mark it processed after
  // the handler runs.
  if (!existing) {
    const { error: insertErr } = await admin.from("stripe_events").insert({
      id: event.id,
      type: event.type,
      community_id: extractCommunityId(event),
      member_id: extractMemberId(event),
      payload: event as unknown as Record<string, unknown>,
    });
    // A concurrent delivery may have inserted the row first (duplicate
    // key). Anything else means we cannot track this event, so ask
    // Stripe to retry rather than processing it untracked.
    if (insertErr && insertErr.code !== "23505") {
      console.error("stripe/webhook: event insert failed", insertErr.message);
      return NextResponse.json(
        { ok: false, error: "event log unavailable" },
        { status: 500 },
      );
    }
  }

  let processError: string | null = null;
  try {
    switch (event.type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(
          event.data.object as Stripe.Subscription,
          admin,
        );
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          admin,
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
          admin,
        );
        break;
      case "invoice.paid":
        await handleInvoicePaid(
          event.data.object as Stripe.Invoice,
          event.id,
          admin,
        );
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
          admin,
        );
        break;
      default:
        // Event recorded but we don't process it. Keeps the log useful
        // for debugging + future handler additions.
        break;
    }
  } catch (err) {
    processError = err instanceof Error ? err.message : String(err);
    console.error(`stripe/webhook: ${event.type} handler failed`, processError);
  }

  // Only a successful run stamps processed_at. A failed run records the
  // error and leaves processed_at null so Stripe's retry is processed.
  const { error: markErr } = await admin
    .from("stripe_events")
    .update(stripeEventCompletionPatch(processError))
    .eq("id", event.id);
  if (markErr) {
    console.error("stripe/webhook: could not record event outcome", markErr.message);
  }

  if (processError) {
    // Return non-2xx so Stripe retries. After Stripe's retry window
    // (about 3 days) the event stops retrying, but the row in
    // stripe_events keeps the payload and error for manual replay.
    return NextResponse.json({ ok: false, error: processError }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// ─── Metadata extractors ──────────────────────────────────────────────────

function extractCommunityId(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as {
    metadata?: { community_id?: string };
  };
  return obj.metadata?.community_id ?? null;
}

function extractMemberId(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as {
    metadata?: { member_id?: string };
  };
  return obj.metadata?.member_id ?? null;
}

// ─── Event handlers ───────────────────────────────────────────────────────

async function handleSubscriptionCreated(
  sub: Stripe.Subscription,
  admin: SupabaseClient,
) {
  const { memberId, communityId, billingPeriod } = parseSubMetadata(sub);
  if (!memberId || !communityId) {
    console.warn("subscription.created: missing metadata", sub.id);
    return;
  }

  const currentPeriodEnd = subPeriodEnd(sub);

  const updates: Record<string, unknown> = {
    subscription_tier: mapStripeStatus(sub.status),
    stripe_subscription_id: sub.id,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    billing_period: billingPeriod,
  };

  const { error: updErr } = await admin
    .from("member_community_memberships")
    .update(updates)
    .eq("member_id", memberId)
    .eq("community_id", communityId);
  if (updErr) throw new Error(`membership update failed: ${updErr.message}`);

  // Founding 100 is claimed on join (free), not on Premium checkout.
}

async function handleSubscriptionUpdated(
  sub: Stripe.Subscription,
  admin: SupabaseClient,
) {
  const { memberId, communityId } = parseSubMetadata(sub);
  if (!memberId || !communityId) {
    // Fall back to locating the membership by stripe_subscription_id —
    // handles the edge case where metadata was stripped somehow.
    const { data: row } = await admin
      .from("member_community_memberships")
      .select("member_id, community_id")
      .eq("stripe_subscription_id", sub.id)
      .maybeSingle();
    if (!row) {
      console.warn("subscription.updated: no matching membership", sub.id);
      return;
    }
  }

  const tier = mapStripeStatus(sub.status);
  const updates: Record<string, unknown> = {
    subscription_tier: tier,
    current_period_end: subPeriodEnd(sub),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
  };

  const { error: updErr } = await admin
    .from("member_community_memberships")
    .update(updates)
    .eq("stripe_subscription_id", sub.id);
  if (updErr) throw new Error(`membership update failed: ${updErr.message}`);
}

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  admin: SupabaseClient,
) {
  // Stripe fires this when the subscription ends (after cancel_at_period_end
  // runs out, or after payment_failed retries exhaust). Revert to free.
  const { error: updErr } = await admin
    .from("member_community_memberships")
    .update({
      subscription_tier: "free",
      stripe_subscription_id: null,
      cancel_at_period_end: false,
      // Keep current_period_end as the historical end date; a future
      // resubscribe will overwrite it.
    })
    .eq("stripe_subscription_id", sub.id);
  if (updErr) throw new Error(`membership update failed: ${updErr.message}`);
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  eventId: string,
  admin: SupabaseClient,
) {
  // An invoice paid against an active subscription — the canonical
  // signal that the subscription is healthy. If the member was past_due,
  // this flips them back to premium. Also refresh the $5 monthly credit.
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return; // Non-subscription invoice — ignore.

  const { data: membership, error: readErr } = await admin
    .from("member_community_memberships")
    .select(
      "member_id, community_id, subscription_tier, monthly_credit_refreshed_at",
    )
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  if (readErr) throw new Error(`membership read failed: ${readErr.message}`);
  if (!membership) return;

  const updates: Record<string, unknown> = {
    subscription_tier: "premium",
  };

  // Monthly credit refresh — only if >25 days since last refresh (prevents
  // abuse where a user churns + re-subscribes to re-grant credit).
  const lastRefreshed = membership.monthly_credit_refreshed_at
    ? new Date(membership.monthly_credit_refreshed_at as string).getTime()
    : 0;
  const daysSince = (Date.now() - lastRefreshed) / (1000 * 60 * 60 * 24);
  const refreshCredit = daysSince >= 25;
  if (refreshCredit) {
    updates.monthly_credit_cents = 500;
    updates.monthly_credit_refreshed_at = new Date().toISOString();
  }

  // Membership first: if this fails we throw and Stripe retries, and no
  // ledger row has been written yet.
  const { error: updErr } = await admin
    .from("member_community_memberships")
    .update(updates)
    .eq("stripe_subscription_id", subId);
  if (updErr) throw new Error(`membership update failed: ${updErr.message}`);

  if (refreshCredit) {
    // Ledger row is best effort. stripe_event_id must be the Stripe event
    // id (FK to stripe_events.id), not the invoice id. We log instead of
    // throwing so a retry cannot double-grant: the membership row above
    // already carries the refreshed credit and timestamp.
    const { error: grantErr } = await admin.from("credit_grants").insert({
      member_id: membership.member_id,
      community_id: membership.community_id,
      amount_cents: 500,
      reason: "monthly_refresh",
      stripe_event_id: eventId,
    });
    if (grantErr) {
      console.error("invoice.paid: credit_grants insert failed", grantErr.message);
    }
  }
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  admin: SupabaseClient,
) {
  // Card declined — Stripe enters its retry schedule (3-4 attempts over
  // ~14 days). Flip to past_due so the UI can nudge the member to update
  // their card, but keep access alive during the grace window. When
  // retries are exhausted, Stripe fires subscription.deleted and we
  // revert to 'free'.
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return;

  const { error: updErr } = await admin
    .from("member_community_memberships")
    .update({ subscription_tier: "past_due" })
    .eq("stripe_subscription_id", subId);
  if (updErr) throw new Error(`membership update failed: ${updErr.message}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseSubMetadata(sub: Stripe.Subscription) {
  const meta = sub.metadata ?? {};
  return {
    memberId: meta.member_id ?? null,
    communityId: meta.community_id ?? null,
    tier: (meta.tier as "standard" | "founder" | undefined) ?? "standard",
    billingPeriod:
      (meta.billing_period as "monthly" | "annual" | undefined) ?? "monthly",
  };
}

function subPeriodEnd(sub: Stripe.Subscription): string | null {
  // current_period_end moved onto subscription items in newer Stripe API
  // versions; the helper reads the new spot and falls back to the old one.
  return subscriptionPeriodEndIso(sub);
}

/**
 * Map Stripe subscription.status → our enum. Stripe statuses:
 * trialing | active | past_due | canceled | unpaid | incomplete |
 * incomplete_expired | paused
 */
function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
      return "premium";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "cancelled";
    default:
      // 'incomplete' / 'incomplete_expired' / 'paused' — conservative
      // fallback leaves the current tier (use a sentinel and caller can
      // decide). Treat as cancelled for now.
      return "cancelled";
  }
}
