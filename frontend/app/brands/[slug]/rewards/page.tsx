import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBrandFromDb } from "@/lib/data/brands";
import { getMemberProfileSlug } from "@/lib/data/member-profile";
import { getSpendablePoints } from "@/lib/data/member";
import { listRewardsForCommunity, listMyRedemptions } from "@/lib/data/rewards";
import { resolveBrandSlug } from "@/lib/brand-aliases";
import { isNelliesThreeVisitRewardActive } from "@/lib/data/nellies-three-visit-reward";
import { NELLIES_BRAND_SLUG, nelliesMemberOfferSummary } from "@/lib/nellies-launch";
import RewardCardWithForm from "./reward-card";

export const dynamic = "force-dynamic";

function MemberPoints({
  isSignedIn,
  points,
}: {
  isSignedIn: boolean;
  points: number;
}) {
  if (!isSignedIn) {
    return (
      <div className="rounded-lg border border-dashed border-iron/15 bg-parchment/30 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-iron/70">Your points</p>
        <p className="mt-1 text-2xl font-bold text-iron">0</p>
        <p className="mt-1 text-xs text-iron/70">
          Sign in to earn and redeem. New accounts start at 0.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-iron/10 bg-parchment/30 px-4 py-2">
      <p className="text-xs uppercase tracking-wide text-iron/70">Your Points</p>
      <p className="mt-1 text-2xl font-bold text-iron">
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
  const isNellies = slug.toLowerCase() === NELLIES_BRAND_SLUG;
  // Spendable balance is read once here and shared by the header tile and
  // every reward card (affordability hint + disabled Redeem). Signed-out
  // viewers get null so the cards keep their sign-in behaviour.
  const [rewards, myRedemptions, memberSlug, threeVisitRewardActive, spendablePoints] =
    await Promise.all([
      listRewardsForCommunity(slug),
      user ? listMyRedemptions(user.id) : Promise.resolve([]),
      user ? getMemberProfileSlug(user.id).catch(() => null) : Promise.resolve(null),
      isNellies ? isNelliesThreeVisitRewardActive() : Promise.resolve(false),
      user ? getSpendablePoints(user.id) : Promise.resolve<number | null>(null),
    ]);
  const nelliesOffers = nelliesMemberOfferSummary(threeVisitRewardActive);

  const recentRedemptions = myRedemptions.slice(0, 5);
  const loginNext = `/brands/${slug}/rewards`;

  return (
    <div className="min-h-screen bg-linen px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Rewards · {brand.name}
          </h1>
          <p className="mt-2 text-sm text-iron/70">
            {isNellies ? (
              <>
                Join Nellie&apos;s and earn points from visits and check-ins. You also get{" "}
                {nelliesOffers}. Daily specials and upcoming events are on the Nellie&apos;s page.
              </>
            ) : (
              <>
                Earn points from visits and check-ins, then use them on the rewards below.
                Member perks for this brand are listed here too.
              </>
            )}
          </p>
          <p className="mt-2 text-xs text-iron/45">
            Move up from Bronze to Platinum as you earn points. The first 100 members join as
            Founders for free. Brands pay, guests join free. Your balance starts at 0
            when you join.
          </p>
        </div>

        {!isSignedIn && (
          <div className="mb-6 rounded-lg border border-aurora/40 bg-gradient-to-r from-aurora/20 via-parchment to-ember/20 px-5 py-4">
            <p className="text-sm font-semibold">Browse rewards — redeem after you join</p>
            <p className="mt-1 text-xs text-iron/70">
              Finish your profile for +100 welcome points, then earn from visits and check-ins.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/signup?brand=${encodeURIComponent(slug)}&next=${encodeURIComponent(loginNext)}`}
                className="rounded-full bg-ember px-4 py-2 text-xs font-semibold text-linen"
              >
                Create free account →
              </Link>
              <Link
                href={`/login?next=${encodeURIComponent(loginNext)}`}
                className="rounded-full border border-iron/20 px-4 py-2 text-xs text-iron/80 hover:bg-iron/10"
              >
                Sign in
              </Link>
            </div>
          </div>
        )}

        <div className="mb-6">
          <MemberPoints isSignedIn={isSignedIn} points={spendablePoints ?? 0} />
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
                spendablePoints={spendablePoints}
              />
            ))}
          </div>
        ) : (
          <div className="glass-card mb-12 rounded-lg p-8 text-center">
            <p className="text-sm text-iron/70">
              {isNellies ? (
                <>
                  Nellie&apos;s member offers are on the Nellie&apos;s page: {nelliesOffers}, plus
                  daily specials and upcoming events. Earn points from visits and check-ins.
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
                    <p className="text-xs text-iron/70">
                      {r.point_cost.toLocaleString()} points • {r.status}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                      r.status === "fulfilled"
                        ? "bg-green-500/20 text-sage-ink"
                        : r.status === "cancelled"
                          ? "bg-red-500/20 text-ember"
                          : "bg-yellow-500/20 text-aurora-ink"
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
