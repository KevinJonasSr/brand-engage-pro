/**
 * Brand billing rules (item 8). Pure functions only, so they can be unit
 * tested and shared by the admin UI, server actions and the Stripe webhook.
 *
 * Brands pay, guests are always free:
 *   - The first 10 businesses are free (plan "free", free_slot 1..10).
 *   - Everyone after that pays $50 per brand per month, card up front,
 *     30-day trial.
 *   - If a paid brand stops paying, admin tools go read-only after a 14-day
 *     grace period. The guest side never locks.
 *
 * The lock rule is mirrored in SQL by public.brand_billing_locked
 * (supabase/migrations/0073_brand_billing.sql). Change both together.
 */

export const BRAND_FREE_SLOT_LIMIT = 10;
export const BRAND_TRIAL_DAYS = 30;
export const BRAND_PAST_DUE_GRACE_DAYS = 14;
export const BRAND_MONTHLY_PRICE_USD = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

export type BrandPlan = "free" | "standard";

export type BrandBillingStatus =
  | "pending"
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete";

export interface BrandBillingRow {
  community_id: string;
  plan: BrandPlan;
  free_slot: number | null;
  status: BrandBillingStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  past_due_since: string | null;
  trial_used: boolean;
}

/** Metadata key that marks a Stripe subscription as brand billing. */
export const BRAND_BILLING_SCOPE = "brand";

function daysBetween(fromIso: string, now: Date): number {
  return (now.getTime() - new Date(fromIso).getTime()) / DAY_MS;
}

/**
 * True when the brand's admin tools should be read-only.
 * No row means unlocked (existing brands keep working until they are set up).
 */
export function isBrandBillingLocked(
  row: Pick<BrandBillingRow, "plan" | "status" | "past_due_since"> | null,
  now: Date = new Date(),
): boolean {
  if (!row) return false;
  if (row.plan === "free") return false;
  if (row.status === "unpaid" || row.status === "canceled") return true;
  if (row.status === "past_due") {
    if (!row.past_due_since) return false;
    return daysBetween(row.past_due_since, now) >= BRAND_PAST_DUE_GRACE_DAYS;
  }
  return false;
}

/** Days left before a past-due brand locks, or null when not past due. */
export function graceDaysLeft(
  row: Pick<BrandBillingRow, "plan" | "status" | "past_due_since"> | null,
  now: Date = new Date(),
): number | null {
  if (!row || row.plan === "free" || row.status !== "past_due") return null;
  if (!row.past_due_since) return BRAND_PAST_DUE_GRACE_DAYS;
  const left = BRAND_PAST_DUE_GRACE_DAYS - daysBetween(row.past_due_since, now);
  return Math.max(0, Math.ceil(left));
}

const KNOWN_STRIPE_STATUSES: Record<string, BrandBillingStatus> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  unpaid: "unpaid",
  canceled: "canceled",
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  paused: "canceled",
};

/** Map a Stripe subscription status onto our brand billing status. */
export function mapStripeStatusToBrand(stripeStatus: string): BrandBillingStatus {
  return KNOWN_STRIPE_STATUSES[stripeStatus] ?? "canceled";
}

/**
 * Keep the first moment a brand went past due, so the grace period does not
 * restart on every webhook. Cleared once the brand is no longer past due.
 */
export function nextPastDueSince(
  previous: Pick<BrandBillingRow, "status" | "past_due_since"> | null,
  nextStatus: BrandBillingStatus,
  now: Date = new Date(),
): string | null {
  if (nextStatus !== "past_due") return null;
  if (previous?.status === "past_due" && previous.past_due_since) {
    return previous.past_due_since;
  }
  return now.toISOString();
}

/** A brand gets the 30-day trial once. */
export function shouldOfferTrial(row: Pick<BrandBillingRow, "trial_used"> | null): boolean {
  return !row?.trial_used;
}

/** Statuses where a Stripe subscription is live and a new Checkout is not needed. */
export function hasLiveSubscription(
  row: Pick<BrandBillingRow, "plan" | "status" | "stripe_subscription_id"> | null,
): boolean {
  if (!row || row.plan === "free" || !row.stripe_subscription_id) return false;
  return (
    row.status === "trialing" ||
    row.status === "active" ||
    row.status === "past_due" ||
    row.status === "incomplete"
  );
}

/** Lowest open free slot (1..10), or null when all 10 are taken. */
export function nextFreeSlot(taken: ReadonlyArray<number | null>): number | null {
  const used = new Set(taken.filter((n): n is number => typeof n === "number"));
  for (let slot = 1; slot <= BRAND_FREE_SLOT_LIMIT; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

/** Read the brand id off Stripe subscription metadata, or null if not ours. */
export function brandIdFromMetadata(
  metadata: Record<string, string | undefined> | null | undefined,
): string | null {
  if (!metadata || metadata.billing_scope !== BRAND_BILLING_SCOPE) return null;
  const id = metadata.community_id?.trim();
  return id ? id : null;
}

export type BillingBannerTone = "info" | "warning" | "danger";

export interface BillingBanner {
  tone: BillingBannerTone;
  message: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Short banner for the admin header, or null when nothing needs saying. */
export function billingBanner(
  row: BrandBillingRow | null,
  now: Date = new Date(),
): BillingBanner | null {
  if (!row || row.plan === "free") return null;

  if (isBrandBillingLocked(row, now)) {
    return {
      tone: "danger",
      message:
        "Billing needs attention. Admin tools are read-only until the plan is active again. Your guests are not affected.",
    };
  }
  if (row.status === "past_due") {
    const left = graceDaysLeft(row, now) ?? 0;
    return {
      tone: "warning",
      message: `Your last payment did not go through. Update your card within ${left} day${left === 1 ? "" : "s"} to keep editing.`,
    };
  }
  if (row.status === "trialing" && row.trial_ends_at) {
    return {
      tone: "info",
      message: `Free trial ends ${formatDate(row.trial_ends_at)}. Your card will be charged $${BRAND_MONTHLY_PRICE_USD} then.`,
    };
  }
  if (row.status === "pending" || row.status === "incomplete") {
    return {
      tone: "info",
      message: "Finish setting up billing to start your 30-day free trial.",
    };
  }
  return null;
}

/** Shown when a brand-data write is refused because the brand is locked. */
export const BRAND_WRITE_LOCKED_MESSAGE =
  "Billing needs attention. Admin tools are read-only until the plan is active again. Visit /admin/billing.";

/** Shown when the billing row could not be read. Fail closed: try again. */
export const BRAND_WRITE_TRY_AGAIN_MESSAGE =
  "We couldn't confirm billing just now. Please try again.";

export class BrandWriteError extends Error {
  readonly status: 403 | 503;
  constructor(status: 403 | 503, message: string) {
    super(message);
    this.name = "BrandWriteError";
    this.status = status;
  }
}

/**
 * True when Stripe brand billing is configured. Both the secret key and the
 * $50 price must be set. When they are not, a brand with no billing row
 * stays writable (billing is not live).
 */
export function stripeBrandBillingConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim() && env.STRIPE_BRAND_PRICE_ID?.trim());
}

export type BrandWriteDecision =
  | { allow: true }
  | { allow: false; status: 403 | 503; message: string };

/**
 * Whether a brand-data write may proceed. This does not look at the request
 * path. Posting an admin action to /admin/billing or to a public page still
 * has to pass this check.
 *
 * Free-slot brands are never locked. A brand with no billing row stays
 * writable when Stripe brand billing is not configured. A failed lookup
 * fails closed (503) once Stripe is configured, because we can no longer
 * tell a free slot from a locked plan.
 */
export function brandWriteDecision(input: {
  row: Pick<BrandBillingRow, "plan" | "status" | "past_due_since" | "free_slot"> | null;
  lookupFailed: boolean;
  stripeConfigured: boolean;
  now?: Date;
}): BrandWriteDecision {
  if (input.row && (input.row.plan === "free" || input.row.free_slot != null)) {
    return { allow: true };
  }
  // Billing is not live. Do not lock a brand we could not find a row for.
  if (!input.stripeConfigured && (input.lookupFailed || input.row == null)) {
    return { allow: true };
  }
  if (input.lookupFailed) {
    return { allow: false, status: 503, message: BRAND_WRITE_TRY_AGAIN_MESSAGE };
  }
  if (isBrandBillingLocked(input.row, input.now)) {
    return {
      allow: false,
      status: 403,
      message: BRAND_WRITE_LOCKED_MESSAGE,
    };
  }
  return { allow: true };
}

/** Admin paths that stay writable while a brand is locked. */
export const BILLING_UNLOCKED_ADMIN_PATHS = ["/admin/billing", "/admin/communities"];

/** True when a server-action POST on this admin path must be refused. */
export function isLockedAdminWritePath(pathname: string): boolean {
  if (!pathname.startsWith("/admin")) return false;
  return !BILLING_UNLOCKED_ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** The subset of a Stripe subscription the brand webhook needs. */
export interface BrandSubscriptionSnapshot {
  id: string;
  status: string;
  customerId: string | null;
  trialEnd: number | null; // unix seconds
  periodEndIso: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Columns to write to brand_billing for a Stripe subscription event.
 * Returns null for a free-slot brand: Stripe never changes a free brand.
 */
export function brandSubscriptionPatch(
  sub: BrandSubscriptionSnapshot,
  previous: Pick<BrandBillingRow, "plan" | "status" | "past_due_since" | "trial_used"> | null,
  now: Date = new Date(),
): Record<string, unknown> | null {
  if (previous?.plan === "free") return null;
  const status = mapStripeStatusToBrand(sub.status);
  return {
    plan: "standard",
    status,
    stripe_subscription_id: sub.id,
    ...(sub.customerId ? { stripe_customer_id: sub.customerId } : {}),
    trial_ends_at: sub.trialEnd ? new Date(sub.trialEnd * 1000).toISOString() : null,
    current_period_end: sub.periodEndIso,
    cancel_at_period_end: sub.cancelAtPeriodEnd,
    past_due_since: nextPastDueSince(previous, status, now),
    trial_used: Boolean(previous?.trial_used) || sub.trialEnd !== null,
  };
}

/**
 * Whether the host-stand screen may show a rotating check-in QR.
 *
 * Super-admins are never blocked (they set the tablet up).
 * A free plan or a free slot stays open, including Nellie's slot 1 and
 * jonas-group-ent slot 2. A failed lookup only blocks when Stripe billing
 * is actually configured, and then it asks the caller to try again.
 */
export const HOST_STAND_TRY_AGAIN_MESSAGE =
  "We couldn't confirm billing just now. Please try again.";

export const HOST_STAND_LOCKED_MESSAGE =
  "Billing needs attention. The host-stand screen stays off until the plan is active again. Visit /admin/billing.";

export type HostStandDisplayDecision =
  | { allow: true }
  | { allow: false; status: 403 | 503; message: string };

/** True when both Stripe env vars the billing page requires are set. */
export function stripeBrandBillingConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.STRIPE_SECRET_KEY?.trim() && env.STRIPE_BRAND_PRICE_ID?.trim());
}

export function hostStandDisplayDecision(input: {
  isSuperAdmin: boolean;
  lookupFailed: boolean;
  stripeConfigured: boolean;
  row: Pick<BrandBillingRow, "plan" | "status" | "past_due_since" | "free_slot"> | null;
  now?: Date;
}): HostStandDisplayDecision {
  if (input.isSuperAdmin) return { allow: true };
  if (input.row?.plan === "free" || input.row?.free_slot != null) return { allow: true };
  if (input.lookupFailed) {
    if (!input.stripeConfigured) return { allow: true };
    return { allow: false, status: 503, message: HOST_STAND_TRY_AGAIN_MESSAGE };
  }
  if (isBrandBillingLocked(input.row, input.now)) {
    return { allow: false, status: 403, message: HOST_STAND_LOCKED_MESSAGE };
  }
  return { allow: true };
}

/** Status after an invoice event. Only recovers or starts past due. */
export function invoiceOutcomeStatus(
  current: BrandBillingStatus,
  outcome: "paid" | "failed",
): BrandBillingStatus {
  if (outcome === "paid") {
    return current === "past_due" || current === "unpaid" ? "active" : current;
  }
  return current === "canceled" || current === "unpaid" ? current : "past_due";
}
