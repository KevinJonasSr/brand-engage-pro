import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext, roleAtLeast } from "@/lib/admin";
import { readBrandBilling } from "@/lib/brand-billing-server";
import {
  BRAND_FREE_SLOT_LIMIT,
  BRAND_MONTHLY_PRICE_USD,
  BRAND_TRIAL_DAYS,
  billingBanner,
  graceDaysLeft,
  hasLiveSubscription,
  type BrandBillingRow,
} from "@/lib/brand-billing";
import {
  grantFreeSlotAction,
  openBrandPortalAction,
  startBrandCheckoutAction,
} from "./actions";
import { BillingBannerNotice } from "./billing-banner";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  started: "Thanks. Stripe is confirming your plan. This page updates within a minute.",
  canceled: "Checkout was canceled. Nothing was charged.",
  "not-configured": "Billing is not switched on yet. The team is setting up Stripe.",
  free: "This business is on a free plan. There is nothing to pay.",
  "already-active": "This business already has an active plan.",
  "no-customer": "There is no billing account yet. Start a plan first.",
  "slots-full": `All ${BRAND_FREE_SLOT_LIMIT} free slots are taken.`,
};

const STATUS_LABELS: Record<BrandBillingRow["status"], string> = {
  pending: "Not started",
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed",
  unpaid: "Unpaid",
  canceled: "Canceled",
  incomplete: "Waiting on payment",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

type BillingLoad =
  | { ok: true; row: BrandBillingRow | null }
  | { ok: false };

async function loadBilling(communityId: string): Promise<BillingLoad> {
  try {
    return { ok: true, row: await readBrandBilling(createAdminClient(), communityId) };
  } catch (err) {
    // Most likely migration 0073 is not applied yet.
    console.warn("billing page: brand_billing unavailable", err);
    return { ok: false };
  }
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/billing");
  if (!ctx.currentCommunityId) redirect("/admin/communities");

  const params = await searchParams;
  const noticeKey =
    (typeof params.error === "string" && params.error) ||
    (params.started ? "started" : params.canceled ? "canceled" : null);
  const notice = noticeKey ? NOTICES[noticeKey] : null;
  const granted = typeof params.granted === "string" ? params.granted : null;

  const canManage = ctx.isSuperAdmin || roleAtLeast(ctx.role, "admin");
  const stripeReady = Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_BRAND_PRICE_ID,
  );
  const load = await loadBilling(ctx.currentCommunityId);
  const row = load.ok ? load.row : null;
  const banner = billingBanner(row);
  const graceLeft = graceDaysLeft(row);
  const isFree = row?.plan === "free";
  const isLive = hasLiveSubscription(row);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="mt-1 text-sm text-white/60">
          ${BRAND_MONTHLY_PRICE_USD} per business per month after a {BRAND_TRIAL_DAYS}-day
          free trial. The first {BRAND_FREE_SLOT_LIMIT} businesses are free. Your
          guests never pay and are never affected by billing.
        </p>
      </header>

      {notice && (
        <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/80">
          {notice}
        </div>
      )}
      {granted && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Free slot {granted} granted.
        </div>
      )}
      {banner && <BillingBannerNotice banner={banner} />}

      {!load.ok ? (
        <section className="rounded-2xl border border-white/10 bg-black/40 p-6 text-sm text-white/70">
          Billing is not set up for this site yet. Nothing is locked and nothing
          is charged.
        </section>
      ) : (
        <section className="rounded-2xl border border-white/10 bg-black/40 p-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-white/50">Plan</dt>
              <dd className="text-white">
                {isFree
                  ? `Free (slot ${row?.free_slot} of ${BRAND_FREE_SLOT_LIMIT})`
                  : `$${BRAND_MONTHLY_PRICE_USD} per month`}
              </dd>
            </div>
            <div>
              <dt className="text-white/50">Status</dt>
              <dd className="text-white">
                {row ? STATUS_LABELS[row.status] : "Not started"}
                {row?.cancel_at_period_end ? " (ends at period end)" : ""}
              </dd>
            </div>
            {row?.trial_ends_at && (
              <div>
                <dt className="text-white/50">Trial ends</dt>
                <dd className="text-white">{formatDate(row.trial_ends_at)}</dd>
              </div>
            )}
            {row?.current_period_end && !isFree && (
              <div>
                <dt className="text-white/50">Current period ends</dt>
                <dd className="text-white">{formatDate(row.current_period_end)}</dd>
              </div>
            )}
            {graceLeft !== null && (
              <div>
                <dt className="text-white/50">Days left to fix payment</dt>
                <dd className="text-white">{graceLeft}</dd>
              </div>
            )}
          </dl>

          {canManage && !isFree && (
            <div className="mt-6 flex flex-wrap gap-3">
              {!isLive && (
                <form action={startBrandCheckoutAction}>
                  <button
                    type="submit"
                    disabled={!stripeReady}
                    className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {row?.trial_used ? "Start plan" : `Start ${BRAND_TRIAL_DAYS}-day free trial`}
                  </button>
                </form>
              )}
              {row?.stripe_customer_id && (
                <form action={openBrandPortalAction}>
                  <button
                    type="submit"
                    disabled={!stripeReady}
                    className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Manage card and invoices
                  </button>
                </form>
              )}
            </div>
          )}
          {canManage && !isFree && !stripeReady && (
            <p className="mt-3 text-xs text-white/50">
              Billing is not switched on yet. The team is setting up Stripe.
            </p>
          )}
          {!canManage && (
            <p className="mt-6 text-xs text-white/50">
              Only owners and admins can change billing.
            </p>
          )}

          {ctx.isSuperAdmin && !isFree && !isLive && (
            <form action={grantFreeSlotAction} className="mt-6 border-t border-white/10 pt-4">
              <p className="mb-2 text-xs text-white/50">
                Super admin: move this business into one of the {BRAND_FREE_SLOT_LIMIT} free slots.
              </p>
              <button
                type="submit"
                className="rounded-lg border border-emerald-400/40 px-4 py-2 text-sm text-emerald-200 hover:border-emerald-300"
              >
                Grant free slot
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
