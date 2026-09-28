import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBrandFromDb } from "@/lib/data/brands";
import { getMemberProfileSlug } from "@/lib/data/member-profile";
import { getSpendablePoints } from "@/lib/data/member";
import { listRewardsForCommunity, listMyRedemptions } from "@/lib/data/rewards";
import { resolveBrandSlug } from "@/lib/brand-aliases";
import { NELLIES_BRAND_SLUG } from "@/lib/nellies-launch";
import RewardCardWithForm from "./reward-card";

export const dynamic = "force-dynamic";

async function MemberPoints({ isSignedIn }: { isSignedIn: boolean }) {
  if (!isSignedIn) {
    return (
      <div className="rounded-lg border border-dashed border-white/15 bg-black/30 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-white/60">Your points</p>
        <p className="mt-1 text-2xl font-bold text-white">0</p>
        <p className="mt-1 text-xs text-white/50">
          Sign in to earn and redeem. New accounts start at 0.
        </p>
      </div>
    );
  }

  const points = await getSpendablePoints();

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-2">
      <p className="text-xs uppercase tracking-wide text-white/60">Your Points</p>
      <p className="mt-1 text-2xl font-bold text-white">
        {points.toLocaleString()}
      </p>
    </div>
  );
}

export default async function RewardsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = resolveBrandSlug(rawSlug);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const brand = await getBrandFromDb(slug);
  if (!brand) return notFound();

  const isSignedIn = user !== null;
  const [rewards, myRedemptions, memberSlug] = await Promise.all([
    listRewardsForCommunity(slug),
    user ? listMyRedemptions(user.id) : Promise.resolve([]),
    user ? getMemberProfileSlug(user.id).catch(() => null) : Promise.resolve(null),
  ]);

  const recentRedemptions = myRedemptions.slice(0, 5);
  const loginNext = `/brands/${slug}/rewards`;
  const isNellies = slug.toLowerCase() === NELLIES_BRAND_SLUG;

  return (
    <div className="min-h-screen bg-midnight px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Rewards · {brand.name}
          </h1>
          <p className="mt-2 text-sm text-white/60">
            {isNellies ? (
              <>
                Join Nellie&apos;s and earn points from visits and check-ins. You also get free
                dessert with an entrée when you join, 1,500 bonus points after three visits, and a
                birthday entrée up to $30. Daily specials and upcoming events are on the
                Nellie&apos;s page.
              </>
            ) : (
              <>
                Earn points from visits and check-ins, then use them on the rewards below.
                Member perks for this brand are listed here too.
              </>
            )}
          </p>
          <p className="mt-2 text-xs text-white/45">
            Move up from Bronze to Platinum as you earn points. The first 100 members join as
            Founders for free. Premium is a separate paid membership. Your balance starts at 0
            when you join.
          </p>
        </div>

        {!isSignedIn && (
          <div className="mb-6 rounded-2xl border border-aurora/40 bg-gradient-to-r from-aurora/20 via-slate-900 to-ember/20 px-5 py-4">
            <p className="text-sm font-semibold">Browse rewards — redeem after you join</p>
            <p className="mt-1 text-xs text-white/70">
              Finish your profile for +100 welcome points, then earn from visits and check-ins.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/signup?ref=${encodeURIComponent(slug)}&next=${encodeURIComponent(loginNext)}`}
                className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-xs font-semibold text-white"
              >
                Create free account →
              </Link>
              <Link
                href={`/login?next=${encodeURIComponent(loginNext)}`}
                className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/80 hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
          </div>
        )}

        <div className="mb-6">
          <MemberPoints isSignedIn={isSignedIn} />
        </div>

        {rewards.length > 0 ? (
          <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rewards.map((reward) => (
              <RewardCardWithForm
                key={reward.id}
                reward={reward}
                brandSlug={slug}
                brandName={brand.name}
                memberSlug={memberSlug}
                isSignedIn={isSignedIn}
              />
            ))}
          </div>
        ) : (
          <div className="glass-card mb-12 rounded-2xl p-8 text-center">
            <p className="text-sm text-white/60">
              {isNellies ? (
                <>
                  Nellie&apos;s member offers are on the Nellie&apos;s page: a welcome dessert with an
                  entrée when you join, 1,500 bonus points after three visits, a birthday entrée up
                  to $30, plus daily specials and upcoming events. Earn points from visits and
                  check-ins.
                </>
              ) : (
                <>No rewards available yet. Check back soon!</>
              )}
            </p>
          </div>
        )}

        {recentRedemptions.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-4 text-lg font-semibold">Your Recent Redemptions</h2>
            <div className="space-y-2">
              {recentRedemptions.map((r) => (
                <div
                  key={r.id}
                  className="glass-card flex items-center justify-between rounded-lg p-4"
                >
                  <div>
                    <p className="text-sm font-medium">{r.reward.title}</p>
                    <p className="text-xs text-white/60">
                      {r.point_cost.toLocaleString()} points • {r.status}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                      r.status === "fulfilled"
                        ? "bg-green-500/20 text-green-300"
                        : r.status === "cancelled"
                          ? "bg-red-500/20 text-red-300"
                          : "bg-yellow-500/20 text-yellow-300"
                    }`}
                  >
                    {r.status === "fulfilled"
                      ? "Fulfilled"
                      : r.status === "cancelled"
                        ? "Cancelled"
                        : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
