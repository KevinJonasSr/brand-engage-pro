import Link from "next/link";
import AvatarUploadCard from "./avatar-upload-card";
import PreviewSignupBanner from "@/components/preview-signup-banner";
import { getBadgesWithEarnedStatus } from "@/lib/data/badges";
import {
  getCurrentMember,
  getCurrentMemberKpis,
  getPointBreakdown,
} from "@/lib/data/member";
import { getTiers, tierIcon } from "@/lib/data/tiers";
import type { Badge, BadgeCategory, TierSlug } from "@/lib/data/types";

const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  welcome:   "Getting started",
  community: "Community",
  referral:  "Referrals",
  tier:      "Tier milestones",
};
const CATEGORY_ORDER: BadgeCategory[] = ["welcome", "community", "referral", "tier"];

type EarnMore = {
  title: string;
  detail: string;
  reward: string;
  href: string;
};
const earnMore: EarnMore[] = [
  { title: "Share your referral link", detail: "Every friend who joins and finishes their profile", reward: "+150 pts", href: "/referrals" },
  { title: "Check in on a visit", detail: "Scan the brand QR once per day", reward: "+25 pts", href: "/brands" },
  { title: "Post in the community", detail: "Say hello or share a visit", reward: "+5 pts", href: "/brands" },
  { title: "Redeem brand rewards", detail: "Food, drink, and loyalty perks at the brand", reward: "—", href: "/brands" },
];

function formatPts(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n) + " pts";
}

export const metadata = { title: "Rewards" };

export default async function RewardsPage() {
  const [member, kpis, tiers, dbBadges, breakdown] = await Promise.all([
    getCurrentMember(),
    getCurrentMemberKpis(),
    getTiers(),
    getBadgesWithEarnedStatus(),
    getPointBreakdown(),
  ]);

  const isSignedIn = member !== null;
  // Guests see honest empty state — no fake 8500 pts / pre-earned badges.
  const badges: Badge[] = isSignedIn ? dbBadges : [];
  const earnedCount = badges.filter((b) => b.earned).length;
  const totalBadges = badges.length;

  const badgesByCategory = new Map<BadgeCategory, Badge[]>();
  for (const b of badges) {
    const cat = (b.category ?? "welcome") as BadgeCategory;
    const arr = badgesByCategory.get(cat) ?? [];
    arr.push(b);
    badgesByCategory.set(cat, arr);
  }

  const currentSlug = (member?.current_tier ?? "bronze") as TierSlug;
  const currentTier = tiers.find((t) => t.slug === currentSlug);
  const nextTier = isSignedIn ? kpis?.next_tier ?? null : null;
  const breakdownTotal = breakdown.reduce((sum, row) => sum + row.total, 0);
  const totalPoints = isSignedIn ? (kpis?.total_points ?? breakdownTotal) : 0;
  const toNext = isSignedIn ? (kpis?.points_to_next_tier ?? 0) : (tiers.find((t) => t.slug === "silver")?.min_points ?? 0);
  const nextThreshold =
    nextTier?.min_points ?? (isSignedIn ? (currentTier?.min_points ?? 0) + toNext : toNext);
  const fromCurrent = isSignedIn ? (currentTier?.min_points ?? 0) : 0;
  const pct = isSignedIn && nextThreshold > fromCurrent
    ? Math.min(100, Math.max(0, ((totalPoints - fromCurrent) / (nextThreshold - fromCurrent)) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-midnight">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 lg:flex-row">
        <div className="flex-1 space-y-6">
          {!isSignedIn && (
            <PreviewSignupBanner
              eyebrow="🎁 Member rewards"
              headline="Join free — earn from real visits"
              body="New members start at 0 and earn from visits, check-ins, and community. Nellie's Jackie launch: free dessert with entrée on join · 1,500 pts after 3 visits · birthday entrée up to $30. Bourbon & Cigar Night — September 23, 7:00 PM ET (Private Dining Room)."
              bullets={[
                "+100 welcome points after you finish your profile",
                "Ladder: Bronze → Platinum · Founding = free first 100 · Premium = separate paid",
                "Nellie's Jackie launch: dessert on join · 1,500 pts after 3 visits · birthday entrée",
              ]}
              primaryCta="Sign up free →"
              nextPath="/rewards"
              firstRewardLine="🎁 Finish your profile for +100 welcome points."
            />
          )}

          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-900/30 via-slate-900 to-midnight p-6 shadow-glass">
            <p className="text-sm uppercase tracking-wide text-white/60">Rewards & loyalty tiers</p>
            <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {isSignedIn
                ? nextTier
                  ? `${formatPts(toNext)} away from ${nextTier.display_name}`
                  : "You're at max loyalty tier"
                : "Earn from visits, check-ins, and community"}
            </h1>
            <p className="mt-4 text-sm text-white/70">
              {isSignedIn && nextTier ? (
                <>
                  Keep earning points to unlock {nextTier.display_name} loyalty perks.
                  Higher loyalty tiers recognize regulars — redeem food and drink rewards on each brand&apos;s rewards page.
                </>
              ) : isSignedIn ? (
                <>You&apos;ve reached the top of the points ladder. Keep checking in and redeeming brand rewards.</>
              ) : (
                <>
                  Loyalty tiers (Bronze → Platinum) come from points you earn after joining.
                  Separate from paid club membership (Premium / Founding) — that&apos;s a different badge on specials and events.
                </>
              )}
            </p>
            <p className="mt-3 text-xs text-white/50">
              Ladder: Bronze → Silver → Gold → Platinum (points from visits). Founding = free
              first 100 who join. Premium is a separate paid club. Join Nellie&apos;s, earn from visits and
              check-ins, then Jackie&apos;s welcome dessert, 1,500 pts after 3 visits, and birthday
              entrée. Bourbon &amp; Cigar Night is September 23, 7:00 PM ET in the Private Dining
              Room. We don&apos;t list empty Gold/Platinum redeemables.
            </p>
            <div className="mt-8 space-y-4">
              <div className="flex items-center justify-between text-sm text-white/70">
                <span>{isSignedIn ? (currentTier?.display_name ?? "Bronze") : "Not started"}</span>
                <span>
                  {isSignedIn
                    ? `${formatPts(totalPoints)} / ${formatPts(nextThreshold)}`
                    : "0 pts — sign up to begin"}
                </span>
              </div>
              <div className="h-3 rounded-full bg-black/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-300 to-rose-400"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs uppercase tracking-wide text-white/50">
                {tiers.map((t) => (
                  <span
                    key={t.slug}
                    className={`flex items-center gap-2 text-sm ${
                      isSignedIn && t.slug === currentSlug ? "text-white" : "text-white/60"
                    }`}
                  >
                    <span>{tierIcon(t.slug)}</span> {t.display_name}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="glass-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-wide text-white/60">Badge gallery</p>
                <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  {isSignedIn
                    ? `${earnedCount} / ${totalBadges} unlocked`
                    : "Sign up to start earning badges"}
                </h2>
              </div>
              {isSignedIn && (
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-white/50">Progress</p>
                  <p className="text-sm font-semibold text-emerald-300">
                    {totalBadges > 0 ? Math.round((earnedCount / totalBadges) * 100) : 0}%
                  </p>
                </div>
              )}
            </div>
            {!isSignedIn ? (
              <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
                <p className="text-sm font-semibold">0 badges yet</p>
                <p className="mt-2 text-xs text-white/60">
                  Join free, finish your profile (+100 welcome points), and earn badges from real visits and community.
                </p>
                <Link
                  href="/signup?next=/rewards"
                  className="mt-4 inline-block text-sm font-medium text-aurora underline underline-offset-2"
                >
                  Sign up to start earning →
                </Link>
              </div>
            ) : badges.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
                <p className="text-sm font-semibold">No badges yet</p>
                <p className="mt-2 text-xs text-white/60">
                  Complete your profile, check in, and post in the community to start earning.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {CATEGORY_ORDER.map((cat) => {
                  const catBadges = badgesByCategory.get(cat) ?? [];
                  if (catBadges.length === 0) return null;
                  return (
                    <div key={cat} className="space-y-3">
                      <p className="text-xs uppercase tracking-wide text-white/50">
                        {CATEGORY_LABELS[cat]} · {catBadges.filter((b) => b.earned).length}/{catBadges.length}
                      </p>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {catBadges.map((badge) => {
                          const hasThreshold = badge.threshold != null && badge.threshold > 0;
                          const progress = badge.progress ?? 0;
                          const badgePct = hasThreshold
                            ? Math.min(100, Math.round((progress / (badge.threshold ?? 1)) * 100))
                            : badge.earned ? 100 : 0;
                          return (
                            <div
                              key={badge.slug}
                              className={`rounded-2xl border p-5 ${
                                badge.earned
                                  ? "border-emerald-500/40 bg-emerald-500/10"
                                  : "border-white/10 bg-black/30"
                              }`}
                            >
                              <div className="flex items-start gap-4">
                                <span
                                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-3xl ${
                                    badge.earned
                                      ? "bg-gradient-to-br from-emerald-400/30 to-aurora/30 ring-1 ring-emerald-400/40"
                                      : "bg-gradient-to-br from-white/10 to-white/5 grayscale opacity-70"
                                  }`}
                                  aria-hidden
                                >
                                  {badge.icon ?? "🏅"}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold leading-tight">{badge.name}</p>
                                  <p className="mt-0.5 text-xs text-white/60">
                                    {badge.earned ? "Unlocked" : "Locked"}
                                    {badge.point_value > 0 && ` · +${badge.point_value} pts`}
                                  </p>
                                </div>
                              </div>
                              {badge.description && (
                                <p className="mt-2 text-xs text-white/60">{badge.description}</p>
                              )}
                              {hasThreshold && !badge.earned && (
                                <div className="mt-3 space-y-1">
                                  <div className="h-1.5 rounded-full bg-black/40">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-aurora to-ember"
                                      style={{ width: `${badgePct}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-white/50">
                                    {progress} / {badge.threshold}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="w-full max-w-sm space-y-6">
          {isSignedIn && (
            <AvatarUploadCard
              initialUrl={member?.avatar_url ?? null}
              firstName={member?.first_name ?? null}
            />
          )}

          <section className="glass-card p-6">
            <p className="text-sm uppercase tracking-wide text-white/60">Earn more points</p>
            <div className="mt-4 space-y-4">
              {earnMore.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="block rounded-2xl bg-black/30 p-4 transition hover:bg-black/40"
                >
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="text-xs text-white/60">{item.detail}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-emerald-300">
                      {item.reward}
                    </span>
                    <span className="text-xs text-white/70">Start →</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="glass-card p-6">
            <p className="text-sm uppercase tracking-wide text-white/60">Point breakdown</p>
            {isSignedIn ? (
              breakdown.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {breakdown.map((cat) => (
                    <div
                      key={cat.source}
                      className="flex items-center justify-between text-sm text-white/70"
                    >
                      <span>{cat.label}</span>
                      <span className="font-semibold text-white">
                        {new Intl.NumberFormat("en-US").format(cat.total)} pts
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm text-white">
                    <span>Available</span>
                    <span className="font-semibold">
                      {new Intl.NumberFormat("en-US").format(totalPoints)} pts
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-4 text-center text-xs text-white/60">
                  Earn your first points to see a breakdown here. Finish your profile for +100 welcome points.
                </div>
              )
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-4 text-center text-xs text-white/60">
                Sign up to earn points from visits and check-ins. Your balance starts at 0.
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}
