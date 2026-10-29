import Link from "next/link";
import { getCurrentMember } from "@/lib/data/member";
import { getCurrentCommunityIdOrNull } from "@/lib/community";
import { listRewardsForCommunity, type RewardRow } from "@/lib/data/rewards";
import { isMarketplaceMusicSku } from "@/lib/marketplace-music-skus";
import { isNelliesThreeVisitRewardActive } from "@/lib/data/nellies-three-visit-reward";
import { NELLIES_BRAND_SLUG, nelliesMemberOfferSummary, nelliesOfferPitch } from "@/lib/nellies-launch";
import PreviewSignupBanner from "@/components/preview-signup-banner";

export const metadata = { title: "Marketplace" };

/**
 * Soft launch: marketplace is a thin pointer to stocked brand rewards.
 * Do not surface Gold/Platinum offer theater or artist leftovers.
 *
 * The page is scoped to the request's community (host subdomain, else the
 * first active brand). With no resolvable community it renders the
 * brand-neutral empty state and points at /brands.
 */
export default async function MarketplacePage() {
  const communityId = await getCurrentCommunityIdOrNull();
  const [member, catalog, threeVisitRewardActive] = await Promise.all([
    getCurrentMember(),
    communityId ? listRewardsForCommunity(communityId) : Promise.resolve([] as RewardRow[]),
    isNelliesThreeVisitRewardActive(),
  ]);
  const atNellies = communityId === NELLIES_BRAND_SLUG;
  // Purge music SKUs even if a stale active row slipped past migration 0050.
  const rewards = catalog.filter((r) => !isMarketplaceMusicSku(r.title));
  const isSignedIn = member !== null;
  const brandRewardsHref = communityId ? `/brands/${communityId}/rewards` : "/brands";
  const brandOfferLine = atNellies
    ? `At Nellie's: ${nelliesMemberOfferSummary(threeVisitRewardActive)}.`
    : "Each brand page lists its own member offers.";

  return (
    <div className="min-h-screen bg-linen">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12">
        {!isSignedIn && (
          <PreviewSignupBanner
            eyebrow="🛍️ Brand rewards"
            headline="Join to unlock brand rewards"
            body={`Earn points after you join, then use them on each brand’s rewards page. ${brandOfferLine}`}
            bullets={[
              "Move up from Bronze to Platinum as you earn points",
              "The first 100 members of each brand join as Founders for free. Brands pay, guests join free.",
              "Each brand page shows its current offers. This page lists rewards you can use points on.",
            ]}
            primaryCta="Sign up free →"
            nextPath="/marketplace"
            firstRewardLine="🎁 Finish your profile for +100 welcome points."
          />
        )}

        <section className="rounded-lg border border-iron/10 bg-gradient-to-br from-aurora/20 via-parchment to-linen p-6 shadow-glass">
          <p className="text-sm uppercase tracking-wide text-iron/70">Marketplace</p>
          <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Brand rewards
          </h1>
          <p className="mt-4 text-sm text-iron/70">
            Rewards you can get with the points you earn. Welcome offers and other member
            perks are on each{" "}
            <Link href={brandRewardsHref} className="text-aurora-ink underline underline-offset-2">
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
            <p className="mt-3 text-sm text-iron/70">
              {atNellies ? (
                <>
                  Nellie&apos;s member offers ({nelliesOfferPitch(threeVisitRewardActive)}, Bourbon
                  &amp; Cigar Night) are on the Nellie&apos;s page. Other brands list their member
                  rewards on their own rewards pages.
                </>
              ) : (
                <>
                  Check each brand&apos;s rewards page for rewards you can use points on, and its
                  brand page for member offers.{" "}
                  <Link href="/brands" className="text-aurora-ink underline underline-offset-2">
                    Browse brands
                  </Link>
                  .
                </>
              )}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={brandRewardsHref}
                className="inline-block rounded-full bg-ember px-6 py-3 text-sm font-semibold text-linen"
              >
                {communityId ? "Go to brand rewards →" : "Browse brands →"}
              </Link>
              {communityId && (
                <Link
                  href="/brands"
                  className="inline-block rounded-full border border-iron/25 px-5 py-3 text-sm font-medium text-iron/85 hover:bg-iron/10"
                >
                  All brands
                </Link>
              )}
            </div>
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {rewards.map((item) => (
              <div key={item.id} className="glass-card p-5">
                <p className="text-xs uppercase tracking-wide text-iron/70">Stocked · soft launch</p>
                <h3 className="mt-3 text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  {item.title}
                </h3>
                {item.description && (
                  <p className="mt-2 text-sm text-iron/70">{item.description}</p>
                )}
                <div className="mt-6 flex items-center justify-between">
                  <span className="text-lg font-semibold text-sage-ink">
                    {new Intl.NumberFormat("en-US").format(item.point_cost)} pts
                  </span>
                  <Link
                    href={brandRewardsHref}
                    className="rounded-full border border-iron/30 px-4 py-2 text-sm text-iron/80 hover:bg-iron/10"
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
