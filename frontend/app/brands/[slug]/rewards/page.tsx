import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBrandFromDb } from "@/lib/data/brands";
import { getMemberProfileSlug } from "@/lib/data/member-profile";
import { listRewardsForCommunity, listMyRedemptions } from "@/lib/data/rewards";
import RewardCardWithForm from "./reward-card";

export const dynamic = "force-dynamic";

async function MemberPoints({ isSignedIn }: { isSignedIn: boolean }) {
  if (!isSignedIn) {
    return (
      <div className="rounded-lg border border-dashed border-white/15 bg-black/30 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-white/60">Your points</p>
        <p className="mt-1 text-2xl font-bold text-white">0</p>
        <p className="mt-1 text-xs text-white/50">
          Preview only — new accounts start at 0. Sign in to earn and redeem.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("members")
    .select("total_points")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-2">
      <p className="text-xs uppercase tracking-wide text-white/60">Your Points</p>
      <p className="mt-1 text-2xl font-bold text-white">
        {(member?.total_points ?? 0).toLocaleString()}
      </p>
    </div>
  );
}

export default async function RewardsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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

  return (
    <div className="min-h-screen bg-midnight px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Rewards · {brand.name}
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Spend points on dining and take-home perks from {brand.name}. Soft-launch highlights
            include the apron + recipe card (1,500 pts) and house hot sauce 3-pack (2,200 pts).
          </p>
          <p className="mt-2 text-xs text-white/45">
            Loyalty ladder: Bronze → Silver → Gold → Platinum (from points). Founding = first 100
            members. Premium club ≈ Gold+ access on gated specials — separate from the points ladder.
          </p>
        </div>

        {!isSignedIn && (
          <div className="mb-6 rounded-2xl border border-aurora/40 bg-gradient-to-r from-aurora/20 via-slate-900 to-ember/20 px-5 py-4">
            <p className="text-sm font-semibold">Browse rewards — redeem after you join</p>
            <p className="mt-1 text-xs text-white/70">
              Preview points below are not a real balance. New accounts start at 0, then earn +100
              welcome points when you finish your profile.
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
            <p className="text-sm text-white/60">No rewards available yet. Check back soon!</p>
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
