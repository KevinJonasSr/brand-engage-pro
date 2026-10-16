import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { getCommunity } from "@/lib/community";
import { countPendingRedemptions } from "@/lib/data/rewards";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBrandBilling } from "@/lib/brand-billing-server";
import { billingBanner, type BillingBanner } from "@/lib/brand-billing";
import { BillingBannerNotice } from "./billing/billing-banner";
import { visibleAdminNav } from "@/lib/ai-features";
import { canSendBlasts } from "@/lib/blast-permissions";

const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/copilot", label: "Copilot ✨" },
  { href: "/admin/goals", label: "Goals" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/brands", label: "Brands" },
  { href: "/admin/checkin-display", label: "Check-in" },
  { href: "/admin/campaigns", label: "Campaigns" },
  { href: "/admin/broadcast", label: "Broadcast" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/community", label: "Community" },
  { href: "/admin/challenges", label: "Challenges" },
  { href: "/admin/offers", label: "Offers" },
  { href: "/admin/rewards", label: "Rewards" },
  { href: "/admin/redemptions", label: "Redemptions" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/policies", label: "Policies" },
  { href: "/admin/team", label: "Team" },
  { href: "/admin/launch", label: "Launch" },
  { href: "/admin/billing", label: "Billing" },
];

/** Billing banner for the current brand. Never breaks the admin shell. */
async function loadBillingBanner(communityId: string): Promise<BillingBanner | null> {
  try {
    return billingBanner(await readBrandBilling(createAdminClient(), communityId));
  } catch (err) {
    // Most likely migration 0073 is not applied yet.
    console.warn("admin layout: billing banner unavailable", err);
    return null;
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin");

  // Check which pathname we're on — if the user hasn't picked a community
  // yet AND they're not already on the switcher page, bounce them there.
  const h = await headers();
  const pathname =
    h.get("x-pathname") ??
    h.get("x-invoke-path") ??
    h.get("next-url") ??
    h.get("referer") ??
    "";
  const isOnSwitcher = pathname.includes("/admin/communities");
  const needsToPick =
    (ctx.isSuperAdmin || ctx.communities.length > 1) &&
    !ctx.currentCommunityId &&
    !isOnSwitcher;
  // Defensive guard: NEVER redirect away from /admin/communities,
  // even if pathname detection somehow fails. Without this guard,
  // a stale path header could re-trigger an infinite 307 loop.
  if (needsToPick && !pathname.includes("/admin/communities")) {
    redirect("/admin/communities");
  }

  const currentCommunity = ctx.currentCommunityId
    ? await getCommunity(ctx.currentCommunityId)
    : null;

  // Count pending redemptions for badge
  let pendingCount = 0;
  if (ctx.currentCommunityId) {
    pendingCount = await countPendingRedemptions(ctx.currentCommunityId);
  }

  // The billing page shows its own banner.
  const banner =
    ctx.currentCommunityId && !pathname.includes("/admin/billing")
      ? await loadBillingBanner(ctx.currentCommunityId)
      : null;

  return (
    <div className="min-h-screen bg-linen">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-iron/10 bg-parchment/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs uppercase tracking-wide text-aurora-ink">
              Admin
            </span>
            {currentCommunity && (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-iron/15 bg-parchment/40 px-3 py-1 text-xs"
                title={`Managing ${currentCommunity.display_name}`}
              >
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${currentCommunity.accent_from}, ${currentCommunity.accent_to})`,
                  }}
                />
                <span className="font-semibold text-iron">
                  {currentCommunity.display_name}
                </span>
                {(ctx.isSuperAdmin || ctx.communities.length > 1) && (
                  <Link
                    href="/admin/communities"
                    className="text-iron/70 hover:text-iron"
                  >
                    switch
                  </Link>
                )}
              </span>
            )}
            <span className="text-iron/70">{ctx.user.email}</span>
            {ctx.isSuperAdmin && (
              <span className="rounded-full bg-aurora/20 px-2 py-0.5 text-xs uppercase tracking-wide text-aurora-ink">
                Super-admin
              </span>
            )}
          </div>
          <Link
            href="/"
            className="text-xs text-iron/70 hover:text-iron"
          >
            ← Back to member site
          </Link>
        </div>

        <nav className="mb-8 flex flex-wrap gap-2">
          {visibleAdminNav(adminNav)
            .filter((item) => item.href !== "/admin/broadcast" || canSendBlasts(ctx))
            .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="relative inline-flex rounded-lg border border-iron/10 px-3 py-2 text-xs font-medium text-iron/70 hover:border-iron/20 hover:text-iron"
            >
              {item.label}
              {item.href === "/admin/redemptions" && pendingCount > 0 && (
                <span className="absolute right-0 top-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-ember text-xs font-bold text-linen translate-x-1 -translate-y-1">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {banner && (
          <div className="mb-6">
            <BillingBannerNotice banner={banner} />
          </div>
        )}

        <main>{children}</main>
      </div>
    </div>
  );
}
