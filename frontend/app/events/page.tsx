import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { listBrandsFromDb, type Brand } from "@/lib/data/brands";
import { isNelliesThreeVisitRewardActive } from "@/lib/data/nellies-three-visit-reward";
import { NELLIES_BRAND_SLUG, nelliesPublicOffers } from "@/lib/nellies-launch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events",
  description: "Upcoming events from the brands you follow.",
};

function rsvpNext(slug: string): string {
  return encodeURIComponent(`/brands/${slug}#upcoming`);
}

/**
 * Slugs of the brands the signed-in member follows. Empty when signed out,
 * following none, or the read fails — callers fall back to every brand.
 */
async function getFollowedBrandSlugs(): Promise<{ signedIn: boolean; slugs: string[] }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { signedIn: false, slugs: [] };
    const { data } = await supabase
      .from("member_brand_following")
      .select("brand_slug")
      .eq("member_id", user.id);
    return {
      signedIn: true,
      slugs: (data ?? []).map((row) => row.brand_slug as string),
    };
  } catch {
    return { signedIn: false, slugs: [] };
  }
}

/**
 * Public upcoming events across the member's followed brands (or every
 * active brand when signed out / following none), grouped by brand.
 * Events come from listBrandsFromDb → rowToBrand, which already drops past
 * events by ends_at / starts_at and applies each brand's launch filters.
 */
function pickEventBrands(brands: Brand[], followedSlugs: string[]): Brand[] {
  const followed = new Set(followedSlugs);
  const mine = brands.filter((b) => followed.has(b.slug));
  return mine.length > 0 ? mine : brands;
}

export default async function EventsPage() {
  const [brands, following, threeVisitRewardActive] = await Promise.all([
    listBrandsFromDb(),
    getFollowedBrandSlugs(),
    isNelliesThreeVisitRewardActive(),
  ]);
  const shownBrands = pickEventBrands(brands, following.slugs);
  const groups = shownBrands.map((brand) => ({
    brand,
    events: brand.upcoming.filter((e) => (e.tier ?? "public") === "public"),
  }));
  const totalEvents = groups.reduce((n, g) => n + g.events.length, 0);
  const showsNellies = shownBrands.some((b) => b.slug === NELLIES_BRAND_SLUG);
  const nelliesOffers = showsNellies ? nelliesPublicOffers({ threeVisitRewardActive }) : [];
  const scopeLine =
    following.signedIn && following.slugs.length > 0
      ? "Upcoming events from the brands you follow."
      : following.signedIn
        ? "You are not following any brands yet, so here is everything that is coming up."
        : "Upcoming events across every brand. Sign in to see just the brands you follow.";

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-iron/70">Events</p>
        <h1 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          What&apos;s coming up
        </h1>
        <p className="text-sm text-iron/70">
          {scopeLine}{" "}
          <Link href="/brands" className="text-aurora-ink underline underline-offset-2">
            Browse all brands
          </Link>
          .
        </p>
      </header>

      {nelliesOffers.length > 0 && (
        <section id="offers" className="glass-card space-y-4 p-6">
          <p className="text-sm uppercase tracking-wide text-iron/70">
            Nellie&apos;s Southern Kitchen · Member offers
          </p>
          <ul className="space-y-4">
            {nelliesOffers.map((offer) => (
              <li key={offer.slug} className="rounded-lg bg-parchment/30 p-5">
                <p className="text-sm font-semibold">{offer.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-iron/70">{offer.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {totalEvents === 0 ? (
        <section id="upcoming" className="glass-card space-y-3 p-6">
          <p className="text-sm uppercase tracking-wide text-iron/70">Upcoming</p>
          <p className="text-sm text-iron/70">New events are coming soon. Check back shortly.</p>
          {shownBrands.length > 0 && (
            <div className="flex flex-wrap gap-3 pt-2">
              {shownBrands.map((brand) => (
                <Link
                  key={brand.slug}
                  href={`/brands/${brand.slug}#upcoming`}
                  className="text-sm text-iron/70 underline-offset-2 hover:text-iron hover:underline"
                >
                  {brand.name}
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : (
        groups
          .filter((g) => g.events.length > 0)
          .map(({ brand, events }) => (
            <section
              key={brand.slug}
              id={`upcoming-${brand.slug}`}
              className="glass-card space-y-3 p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm uppercase tracking-wide text-iron/70">{brand.name}</p>
                <Link
                  href={`/brands/${brand.slug}#upcoming`}
                  className="text-xs text-iron/70 underline-offset-2 hover:text-iron hover:underline"
                >
                  View on the brand page
                </Link>
              </div>
              <ul className="space-y-4">
                {events.map((event) => (
                  <li key={event.id ?? event.title} className="rounded-lg bg-parchment/30 p-5">
                    <p className="text-sm font-semibold">{event.title}</p>
                    {event.detail && <p className="mt-1 text-xs text-iron/70">{event.detail}</p>}
                    {event.location && (
                      <p className="mt-2 text-xs text-iron/70">📍 {event.location}</p>
                    )}
                    {event.date && (
                      <p className="mt-3 text-xs uppercase tracking-wide text-iron/70">{event.date}</p>
                    )}
                    {event.capacity != null && (
                      <p className="mt-1 text-xs text-iron/70">Cap {event.capacity}</p>
                    )}
                    {event.url && (
                      <a
                        href={event.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-xs font-semibold text-aurora-ink underline underline-offset-2"
                      >
                        Get tickets
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {following.signedIn ? (
                  <Link
                    href={`/brands/${brand.slug}#upcoming`}
                    className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-linen"
                  >
                    Go to RSVP →
                  </Link>
                ) : (
                  <>
                    <Link
                      href={`/login?next=${rsvpNext(brand.slug)}`}
                      className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-linen"
                    >
                      Sign in to RSVP
                    </Link>
                    <Link
                      href={`/signup?brand=${brand.slug}&next=${rsvpNext(brand.slug)}`}
                      className="rounded-full border border-iron/25 px-4 py-2 text-sm font-medium text-iron/85 hover:bg-iron/10"
                    >
                      Join to RSVP
                    </Link>
                  </>
                )}
              </div>
            </section>
          ))
      )}
    </main>
  );
}
