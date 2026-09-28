import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeOrNull } from "@/lib/stripe";
import { openBillingPortalAction } from "./actions";

export const metadata = { title: "Billing" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BILLED_TIERS = ["premium", "past_due", "cancelled", "comped"] as const;

const ERROR_COPY: Record<string, string> = {
  not_configured:
    "Billing is not set up in this environment yet. Please try again later.",
  no_customer: "We could not find a billing account for you.",
  portal:
    "We could not open the billing portal just now. Please try again in a minute.",
};

type MembershipRow = {
  community_id: string;
  subscription_tier: string;
  billing_period: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function statusLine(m: MembershipRow): string {
  const parts: string[] = [];
  if (m.billing_period) parts.push(m.billing_period);
  const end = formatDate(m.current_period_end);
  if (end && m.subscription_tier !== "comped") {
    const endsForGood =
      m.cancel_at_period_end || m.subscription_tier === "cancelled";
    parts.push(endsForGood ? `Ends ${end}` : `Renews ${end}`);
  }
  return parts.join(" · ");
}

function StatusPill({ tier }: { tier: string }) {
  const styles: Record<string, { label: string; cls: string }> = {
    premium: { label: "Active", cls: "bg-emerald-500/20 text-emerald-300" },
    comped: { label: "Comped", cls: "bg-sky-500/20 text-sky-300" },
    past_due: { label: "Past due", cls: "bg-yellow-500/20 text-yellow-300" },
    cancelled: { label: "Cancelled", cls: "bg-white/10 text-white/60" },
  };
  const s = styles[tier] ?? styles.cancelled;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/billing");

  const { error: errorKey } = await searchParams;
  const errorMessage = errorKey ? (ERROR_COPY[errorKey] ?? null) : null;

  const admin = createAdminClient();
  const [{ data: member }, { data: rows }] = await Promise.all([
    admin
      .from("members")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle(),
    admin
      .from("member_community_memberships")
      .select(
        "community_id, subscription_tier, billing_period, current_period_end, cancel_at_period_end",
      )
      .eq("member_id", user.id)
      .in("subscription_tier", [...BILLED_TIERS]),
  ]);

  const memberships = (rows ?? []) as MembershipRow[];
  const hasStripe = getStripeOrNull() !== null;
  const hasCustomer = Boolean(member?.stripe_customer_id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <Link
          href="/me"
          className="text-xs uppercase tracking-widest text-white/60 hover:text-white"
        >
          ← Account
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-3 text-white/70">
          See your Premium memberships, update your card, or cancel.
        </p>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-200"
        >
          {errorMessage}
        </div>
      )}

      {memberships.length > 0 && (
        <section className="mb-8 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/50">
            Memberships
          </h2>
          <ul className="space-y-3">
            {memberships.map((m) => {
              const line = statusLine(m);
              return (
                <li
                  key={m.community_id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <div>
                    <div className="font-medium capitalize">
                      {m.community_id.replace(/-/g, " ")}
                    </div>
                    {line && (
                      <div className="mt-0.5 text-sm capitalize text-white/60">
                        {line}
                      </div>
                    )}
                  </div>
                  <StatusPill tier={m.subscription_tier} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!hasStripe && (
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 text-sm text-yellow-200">
          Billing is not set up in this environment yet.
        </div>
      )}

      {hasStripe && !hasCustomer && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/70">
          You don&apos;t have a paid subscription.{" "}
          <Link href="/premium" className="underline hover:text-white">
            See Premium
          </Link>
        </div>
      )}

      {hasStripe && hasCustomer && (
        <div className="space-y-3">
          <form action={openBillingPortalAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Manage billing or cancel
            </button>
          </form>
          <p className="text-xs text-white/50">
            Opens Stripe&apos;s secure billing portal, where you can update
            your card, switch plans, see invoices, or cancel. You&apos;ll come
            back here when you&apos;re done.
          </p>
        </div>
      )}
    </main>
  );
}
