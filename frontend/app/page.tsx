import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import MemberHomeDashboard from "@/components/member-home-dashboard";
import InviteQRCode from "@/components/invite-qr";
import SignedOutLanding from "@/components/signed-out-landing";
import { listBrandsFromDb } from "@/lib/data/brands";
import { getCurrentMember, getCurrentMemberKpis } from "@/lib/data/member";
import { getMemberHomeData } from "@/lib/data/member-home";
import { getFeaturedOffers } from "@/lib/data/offers";
import { getTiers, tierIcon } from "@/lib/data/tiers";
import type { TierSlug } from "@/lib/data/types";

import { touchStreak } from "@/lib/streaks/touch";
import { gatherWeeklyRecap } from "@/lib/personal-recap/gather";
// ─── Signed-in dashboard content ──────────────────────────────────────────
// Signed-out visitors render <SignedOutLanding/> earlier and never see any
// of this.

const quickActions: { label: string; href: string }[] = [
  { label: "Share referral link", href: "/referrals" },
  { label: "Browse marketplace", href: "/marketplace" },
  { label: "Check rewards", href: "/rewards" },
  { label: "Invite a friend", href: "/onboarding" },
];

function formatPts(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n) + " pts";
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  // Supabase's default email templates point the confirmation link at
  // `{SITE_URL}?code=...` — i.e., the root — instead of `/auth/callback`.
  // Forward any code to the real callback route so sessions actually complete.
  const params = await searchParams;
  if (params.code) {
    redirect(`/auth/callback?code=${encodeURIComponent(params.code)}&next=/onboarding`);
  }

  // First pass: just fetch the member. If signed-out, render the marketing
  // landing and skip all the signed-in data queries (they're noise here).
  const member = await getCurrentMember();
  const isSignedIn = member !== null;

  if (!isSignedIn) {
    const brands = await listBrandsFromDb();
    return <SignedOutLanding brands={brands} />;
  }

  // Signed-in path — parallel-fetch everything the dashboard needs. Each
  // gracefully returns null / empty on error so the page never breaks.
  const [kpis, featured, tiers, streak, recap, memberHome] = await Promise.all([
    getCurrentMemberKpis(),
    getFeaturedOffers(3),
    getTiers(),
    // Touch streak before reading home data so the dashboard
    // sees the freshly-incremented streak counter on the same render.
    member?.id ? touchStreak(member.id) : Promise.resolve(null),
      // Compute the past-7-day recap for the "Your week" tile. Returns a
    // benign empty recap on error so Member Home never blocks.
    member?.id ? gatherWeeklyRecap(member.id) : Promise.resolve(null),
      getMemberHomeData(),
  ]);

  // KPI grid — real data from Supabase. If kpis is null (DB hiccup), we
  // render zeros rather than fake marketing numbers so nothing ever lies.
  const kpiCards = [
    {
      label: "Total Points",
      value: kpis
        ? new Intl.NumberFormat("en-US").format(kpis.total_points)
        : "0",
      delta: "",
    },
    {
      label: "Referrals",
      value: String(kpis?.referral_count ?? 0),
      delta: "",
    },
    {
      label: "Badges",
      value: String(kpis?.badge_count ?? 0),
      delta: "",
    },
    {
      label: "Next Reward",
      value: kpis?.next_tier?.display_name ?? "Max tier",
      delta:
        kpis?.points_to_next_tier != null
          ? `${formatPts(kpis.points_to_next_tier)} to go`
          : "",
    },
  ];

  // Show a "Finish profile" nudge when signed-in users have no first_name yet.
  const needsProfile = !member.first_name;

  // Featured offers: DB only — no more fallback/lie content now that this
  // branch is signed-in-only.
  const offers = featured.map((o) => ({
    slug: o.slug,
    title: o.title,
    tier: `${o.min_tier[0].toUpperCase() + o.min_tier.slice(1)}`,
    points: o.price_points ? formatPts(o.price_points) : `$${(o.price_cents ?? 0) / 100}`,
    imageUrl: o.image_url,
  }));

  // Tier journey card — use real tier + member's current status if available.
  const currentTier = (member?.current_tier ?? "bronze") as TierSlug;

  // Build the invite URL for signed-in members (used by the QR card).
  const headerList = await headers();
  const host =
    process.env.NEXT_PUBLIC_APP_URL ??
    (headerList.get("x-forwarded-host") ?? headerList.get("host"));
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const origin = host?.startsWith("http") ? host : `${proto}://${host}`;
  const inviteUrl = member?.referral_code
    ? `${origin}/invite/${member.referral_code}`
    : null;

  return (
    <div className="min-h-screen bg-midnight">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 lg:flex-row">
        <div className="flex-1 space-y-6">
          {needsProfile && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-aurora/40 bg-gradient-to-r from-aurora/20 via-slate-900 to-ember/20 px-5 py-4">
              <div>
                <p className="text-sm font-semibold">Finish setting up your profile</p>
                <p className="text-xs text-white/70">
                  Takes less than a minute — unlocks your referral code, SMS alerts, and a signup bonus.
                </p>
              </div>
              <Link
                href="/signup"
                className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
              >
                Complete profile
              </Link>
            </section>
          )}
          {/* Personalized Member Home dashboard — only for members past
              onboarding. Still signed-in, so the marketing landing never
              appears here. */}
          {!needsProfile && memberHome && <MemberHomeDashboard data={memberHome} streak={streak} recap={recap} />}
          <section className="glass-card p-6">
            <p className="flex items-center gap-2 text-sm uppercase tracking-wide text-white/60">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
                ★
              </span>
              {member?.first_name ? `Welcome back, ${member.first_name}` : "Member Momentum"}
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {kpiCards.map((kpi) => (
                <div key={kpi.label} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-xs uppercase tracking-wide text-white/50">{kpi.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{kpi.value}</p>
                  {kpi.delta && <p className="text-sm text-emerald-300">{kpi.delta}</p>}
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="glass-card space-y-4 p-6">
              <p className="flex items-center gap-2 text-sm uppercase tracking-wide text-white/60">
                <span>📅</span> Upcoming Events
              </p>
              <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-xs text-white/60">
                No events scheduled yet. Brand drops and member events will show here.
              </div>
            </div>
            <div className="glass-card space-y-4 p-6">
              <p className="flex items-center gap-2 text-sm uppercase tracking-wide text-white/60">
                <span>🎁</span> Recommended Offers
              </p>
              {offers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-6 text-center text-xs text-white/60">
                  No offers right now. Check back — new drops appear here automatically.
                </div>
              ) : (
                offers.map((offer) => (
                  <Link
                    key={offer.slug ?? offer.title}
                    href="/marketplace"
                    className="group block overflow-hidden rounded-2xl bg-black/30 transition hover:bg-black/40"
                  >
                    {offer.imageUrl ? (
                      <div className="aspect-[16/9] w-full overflow-hidden bg-black/60">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={offer.imageUrl}
                          alt=""
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      </div>
                    ) : (
                      <div className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-amber-500/20 via-aurora/10 to-ember/20 text-5xl">
                        🎁
                      </div>
                    )}
                    <div className="p-5">
                      <p className="text-base font-semibold">{offer.title}</p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-white/50">
                        {offer.tier}
                      </p>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-xl font-bold text-emerald-300">
                          {offer.points}
                        </span>
                        <span className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium transition group-hover:bg-white/20">
                          View →
                        </span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>

          <section className="glass-card p-6">
            <p className="flex items-center gap-2 text-sm uppercase tracking-wide text-white/60">
              <span>⚡</span> Quick Actions
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {quickActions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-medium text-white/80 transition hover:border-white/30 hover:bg-white/10"
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="w-full max-w-sm space-y-6">
          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-400/30 via-black to-aurora/30 p-6 text-white shadow-glass">
            <p className="text-sm uppercase tracking-wide text-white/70">Tier Journey</p>
            <h3 className="mt-2 text-xl font-semibold">
              {kpis?.next_tier
                ? `${tiers.find((t) => t.slug === currentTier)?.display_name ?? "Bronze"} · ${formatPts(
                    kpis.points_to_next_tier,
                  )} to ${kpis.next_tier.display_name}`
                : "Your tier at a glance"}
            </h3>
            <div className="mt-6 space-y-3">
              {tiers.map((tier) => {
                const unlocked =
                  kpis != null && kpis.total_points >= tier.min_points;
                const isCurrent = tier.slug === currentTier;
                return (
                  <div
                    key={tier.slug}
                    className={`flex items-center justify-between rounded-2xl px-5 py-4 ${
                      isCurrent
                        ? "bg-white/15 ring-1 ring-white/25"
                        : "bg-black/30"
                    }`}
                  >
                    <span className="flex items-center gap-3 text-base font-semibold">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-2xl">
                        {tierIcon(tier.slug)}
                      </span>
                      {tier.display_name}
                    </span>
                    <span className="text-sm uppercase tracking-wide text-white/60">
                      {unlocked ? "Unlocked" : `${formatPts(tier.min_points)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {inviteUrl && (
            <section className="glass-card p-6">
              <p className="text-sm uppercase tracking-wide text-white/60">Your invite</p>
              <p className="mt-2 text-xs text-white/60">
                Share the QR for instant sign-ups. Every verified join earns you 150 pts.
              </p>
              <div className="mt-4">
                <InviteQRCode url={inviteUrl} />
              </div>
              <Link
                href="/referrals"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                Open referrals →
              </Link>
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}
