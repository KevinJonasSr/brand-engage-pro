import { getActiveOffers } from "@/lib/data/offers";
import { getCurrentMember } from "@/lib/data/member";
import { getCurrentCommunityId } from "@/lib/community";
import type { Offer } from "@/lib/data/types";
import PreviewSignupBanner from "@/components/preview-signup-banner";
import Link from "next/link";

const tabs = ["Featured", "Food & drink", "Experiences", "Merch", "Member-exclusive"];

function formatPrice(o: Offer): string {
  if (o.price_points) return `${new Intl.NumberFormat("en-US").format(o.price_points)} pts`;
  if (o.price_cents != null) return `$${(o.price_cents / 100).toFixed(2)}`;
  return "—";
}

function formatTier(slug: Offer["min_tier"]): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function formatCategory(cat: Offer["category"]): string {
  return {
    merch: "Merch",
    experience: "Experience",
    collectible: "Collectible",
    digital: "Digital",
    ticket: "Ticket",
  }[cat];
}

export const metadata = { title: "Marketplace" };

export default async function MarketplacePage() {
  const [dbOffers, member, communityId] = await Promise.all([
    getActiveOffers(),
    getCurrentMember(),
    getCurrentCommunityId(),
  ]);
  const isSignedIn = member !== null;

  const products = dbOffers.map((o) => ({
    title: o.title,
    tier: formatTier(o.min_tier),
    pts: formatPrice(o),
    category: formatCategory(o.category),
    badge: o.inventory != null && o.inventory > 0 ? `${o.inventory} left` : "New",
    slug: o.slug,
  }));

  const brandRewardsHref = `/brands/${communityId}/rewards`;

  return (
    <div className="min-h-screen bg-midnight">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 lg:flex-row">
        <div className="flex-1 space-y-6">
          {!isSignedIn && (
            <PreviewSignupBanner
              eyebrow="🛍️ Preview"
              headline="Sign up to redeem member rewards"
              body="Members earn points for visits, check-ins, and community — then redeem them for food, drink, and loyalty perks at this brand."
              bullets={[
                "Real rewards from the brand you follow",
                "Points from visits, stamps, and engagement",
                "Member-only specials for regulars",
              ]}
              primaryCta="Sign up to redeem →"
              nextPath="/marketplace"
              firstRewardLine="🎁 Unlock your first member perk the day you join."
            />
          )}

          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-900/30 via-slate-900 to-midnight p-6 shadow-glass">
            <p className="text-sm uppercase tracking-wide text-white/60">Marketplace</p>
            <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Member rewards for this brand
            </h1>
            <p className="mt-4 text-sm text-white/70">
              Soft launch shows loyalty rewards for the active brand only — not artist or fan-club catalog items.
              Prefer the brand rewards page for stamp cards and visit redemptions.
            </p>
            <div className="mt-4">
              <Link
                href={brandRewardsHref}
                className="text-sm font-medium text-aurora underline underline-offset-2 hover:text-white"
              >
                Open brand rewards →
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              {tabs.map((tab, index) => (
                <button
                  key={tab}
                  className={`rounded-full px-4 py-2 text-sm ${
                    index === 0
                      ? "bg-white text-midnight"
                      : "border border-white/20 text-white/70"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </section>

          {products.length === 0 ? (
            <section className="glass-card p-8 text-center">
              <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                No marketplace rewards yet
              </h2>
              <p className="mt-3 text-sm text-white/60">
                Check the brand rewards page for visit perks, stamp cards, and redeemable offers.
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
              {products.map((item) => (
                <div key={item.slug} className="glass-card p-5">
                  <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/50">
                    <span>{item.tier !== "Bronze" && item.tier !== "All tiers" && "🔒 "}{item.tier}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-white/70">{item.badge}</span>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-white/70">Category · {item.category}</p>
                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-lg font-semibold text-emerald-300">{item.pts}</span>
                    <Link
                      href={brandRewardsHref}
                      className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                    >
                      View rewards
                    </Link>
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>

      </main>
    </div>
  );
}
