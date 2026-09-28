import Link from "next/link";
import type { Metadata } from "next";
import { getBrandFromDb } from "@/lib/data/brands";
import { NELLIES_BRAND_SLUG, NELLIES_PUBLISHED_OFFERS } from "@/lib/nellies-launch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events",
  description: "Nellie's Southern Kitchen member offers and upcoming events.",
};

const RSVP_NEXT = encodeURIComponent("/brands/nellies#upcoming");

/**
 * Guest-visible events/offers surface so /events is not a 404.
 * Offers are Jackie's three (lib/nellies-launch.ts). Events come from
 * brand_events via getBrandFromDb, filtered by applyNelliesLaunchEvents.
 */
export default async function EventsPage() {
  const brand = await getBrandFromDb(NELLIES_BRAND_SLUG);
  const events = brand?.upcoming ?? [];

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-white/60">Nellie&apos;s Southern Kitchen</p>
        <h1 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Member offers &amp; events
        </h1>
        <p className="text-sm text-white/70">
          Member offers and what&apos;s coming up.{" "}
          <Link href="/brands/nellies" className="text-aurora underline underline-offset-2">
            Open the Nellie&apos;s brand page
          </Link>{" "}
          for daily specials.
        </p>
      </header>

      <section id="offers" className="glass-card space-y-4 p-6">
        <p className="text-sm uppercase tracking-wide text-white/60">Member offers</p>
        <ul className="space-y-4">
          {NELLIES_PUBLISHED_OFFERS.map((offer) => (
            <li key={offer.slug} className="rounded-2xl bg-black/30 p-5">
              <p className="text-sm font-semibold">{offer.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/70">{offer.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="upcoming" className="glass-card space-y-3 p-6">
        <p className="text-sm uppercase tracking-wide text-white/60">Upcoming</p>
        {events.length === 0 ? (
          <p className="text-sm text-white/60">New events are coming soon. Check back shortly.</p>
        ) : (
          <ul className="space-y-4">
            {events.map((event) => (
              <li key={event.id ?? event.title} className="rounded-2xl bg-black/30 p-5">
                <p className="text-sm font-semibold">{event.title}</p>
                {event.detail && <p className="mt-1 text-xs text-white/70">{event.detail}</p>}
                {event.location && (
                  <p className="mt-2 text-xs text-white/60">📍 {event.location}</p>
                )}
                {event.date && (
                  <p className="mt-3 text-xs uppercase tracking-wide text-white/40">{event.date}</p>
                )}
                {event.capacity != null && (
                  <p className="mt-1 text-xs text-white/50">Cap {event.capacity}</p>
                )}
                {event.url && (
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block text-xs font-semibold text-aurora underline underline-offset-2"
                  >
                    Get tickets
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            href={`/login?next=${RSVP_NEXT}`}
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-semibold text-white"
          >
            Sign in to RSVP
          </Link>
          <Link
            href={`/signup?ref=nellies&next=${RSVP_NEXT}`}
            className="rounded-full border border-white/25 px-4 py-2 text-sm font-medium text-white/85 hover:bg-white/10"
          >
            Join to RSVP
          </Link>
          <Link
            href="/brands/nellies#upcoming"
            className="text-sm text-white/70 underline-offset-2 hover:text-white hover:underline"
          >
            View on the brand page
          </Link>
        </div>
      </section>
    </main>
  );
}
