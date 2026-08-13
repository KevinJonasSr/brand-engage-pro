import Link from "next/link";
import { getCurrentMember } from "@/lib/data/member";
import { getCurrentCommunityId } from "@/lib/community";
import { listRewardsForCommunity } from "@/lib/data/rewards";
import { isMarketplaceMusicSku } from "@/lib/marketplace-music-skus";
import PreviewSignupBanner from "@/components/preview-signup-banner";

export const metadata = { title: "Marketplace" };

/**
 * Soft launch: marketplace is a thin pointer to stocked brand rewards.
 * Do not surface Gold/Platinum offer theater or artist leftovers.
 */
export default async function MarketplacePage() {
  const communityId = await getCurrentCommunityId();
  const [member, catalog] = await Promise.all([
    getCurrentMember(),
    listRewardsForCommunity(communityId),
  ]);
  // Purge music SKUs even if a stale active row slipped past migration 0050.
  const rewards = catalog.filter((r) => !isMarketplaceMusicSku(r.title));
  const isSignedIn = member !== null;
  const brandRewardsHref = `/brands/${communityId}/rewards`;

  return (
    <div className="min-h-screen bg-midnight">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12">
        {!isSignedIn && (
          <PreviewSignupBanner
            eyebrow="🛍️ Brand rewards"
            headline="Preview totals aren’t real — new accounts start at 0"
            body="Logged-out preview banners never showed a real balance (and high sample numbers were misleading). Nellie's Jackie launch: free dessert with entrée on join, 1,500 bonus points after 3 visits, birthday entrée up to $30. Bourbon & Cigar Night — September 23, 7:00 PM ET, Private Dining Room."
            bullets={[
              "Ladder: Bronze → Platinum from points you earn after joining",
              "Founding = first 100 · Premium ≈ Gold+ on gated specials",
              "We don’t market empty Gold/Platinum redeemables",
            ]}
            primaryCta="Sign up free →"
            nextPath="/marketplace"
            firstRewardLine="🎁 Finish your profile for +100 welcome points."
          />
        )}

        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-900/30 via-slate-900 to-midnight p-6 shadow-glass">
          <p className="text-sm uppercase tracking-wide text-white/60">Marketplace</p>
          <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Stocked brand rewards only
          </h1>
          <p className="mt-4 text-sm text-white/70">
            Soft launch lists what&apos;s actually stocked on the brand rewards page — not a
            Gold/Platinum catalog of empty SKUs. Prefer{" "}
            <Link href={brandRewardsHref} className="text-aurora underline underline-offset-2">
              brand rewards
            </Link>{" "}
            for redeem + pickup.
          </p>
        </section>

        {rewards.length === 0 ? (
          <section className="glass-card p-8 text-center">
            <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              No stocked rewards yet
            </h2>
            <p className="mt-3 text-sm text-white/60">
              Check the brand rewards page — soft launch may still be loading catalog rows.
            </p>
            <Link
              href={brandRewardsHref}
              className="mt-6 inline-block rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white"
            >
              Go to brand rewards →
            </Link>
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {rewards.map((item) => (
              <div key={item.id} className="glass-card p-5">
                <p className="text-xs uppercase tracking-wide text-white/50">Stocked · soft launch</p>
                <h3 className="mt-3 text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  {item.title}
                </h3>
                {item.description && (
                  <p className="mt-2 text-sm text-white/70">{item.description}</p>
                )}
                <div className="mt-6 flex items-center justify-between">
                  <span className="text-lg font-semibold text-emerald-300">
                    {new Intl.NumberFormat("en-US").format(item.point_cost)} pts
                  </span>
                  <Link
                    href={brandRewardsHref}
                    className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                  >
                    {isSignedIn ? "Redeem on brand page →" : "View on brand page →"}
                  </Link>
                </div>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
