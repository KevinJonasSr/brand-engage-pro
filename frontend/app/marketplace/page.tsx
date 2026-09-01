import Link from "next/link";
import { getCurrentMember } from "@/lib/data/member";
import { getCurrentCommunityId } from "@/lib/community";
import { listRewardsForCommunity } from "@/lib/data/rewards";
import { isMarketplaceMusicSku } from "@/lib/marketplace-music-skus";
import { NELLIES_BRAND_SLUG } from "@/lib/nellies-launch";
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
            headline="Join to unlock brand rewards"
            body="Earn points after you join, then redeem on each brand’s rewards page. Nellie's Jackie launch: free dessert with entrée on join, 1,500 bonus points after 3 visits, birthday entrée up to $30. Bourbon & Cigar Night — September 23, 7:00 PM ET, Private Dining Room."
            bullets={[
              "Ladder: Bronze → Platinum from points you earn after joining",
              "Founding = free first 100 · Premium = separate paid club",
              "Live unlocks sit on each brand page — this list is stocked catalog only",
            ]}
            primaryCta="Sign up free →"
            nextPath="/marketplace"
            firstRewardLine="🎁 Finish your profile for +100 welcome points."
          />
        )}

        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-900/30 via-slate-900 to-midnight p-6 shadow-glass">
          <p className="text-sm uppercase tracking-wide text-white/60">Marketplace</p>
          <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Brand rewards
          </h1>
          <p className="mt-4 text-sm text-white/70">
            Catalog items you can redeem with points you earn after joining. Jackie launch
            perks and digital unlocks live on each{" "}
            <Link href={brandRewardsHref} className="text-aurora underline underline-offset-2">
              brand rewards
            </Link>{" "}
            page.
          </p>
        </section>

        {rewards.length === 0 ? (
          <section className="glass-card p-8 text-center">
            <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Live unlocks are on brand pages
            </h2>
            <p className="mt-3 text-sm text-white/60">
              {communityId.toLowerCase() === NELLIES_BRAND_SLUG ? (
                <>
                  Nellie&apos;s Jackie launch perks (welcome dessert, 1,500 pts after 3 visits,
                  birthday entrée, Bourbon &amp; Cigar Night) live on the brand page — they are
                  not catalog SKUs. Jonas Group Entertainment lists member rewards (signed lyric
                  sheets, catalog vinyl) on its brand rewards page.
                </>
              ) : (
                <>
                  Check each brand&apos;s rewards page for live redeemables and digital unlocks.
                  Nellie&apos;s Jackie launch perks sit on the brand page; JGE lists member
                  rewards on{" "}
                  <Link href="/brands/jonas-group-ent/rewards" className="text-aurora underline underline-offset-2">
                    /brands/jonas-group-ent/rewards
                  </Link>
                  .
                </>
              )}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={brandRewardsHref}
                className="inline-block rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white"
              >
                Go to brand rewards →
              </Link>
              <Link
                href="/brands/jonas-group-ent/rewards"
                className="inline-block rounded-full border border-white/25 px-5 py-3 text-sm font-medium text-white/85 hover:bg-white/10"
              >
                JGE rewards
              </Link>
            </div>
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
