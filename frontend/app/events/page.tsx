import Link from "next/link";
import type { Metadata } from "next";
import { getBrandFromDb } from "@/lib/data/brands";
import {
  NELLIES_BOURBON_CAPACITY,
  NELLIES_BOURBON_LOCATION,
  NELLIES_BOURBON_TITLE,
  NELLIES_BOURBON_WHEN,
  NELLIES_BRAND_SLUG,
  NELLIES_PUBLISHED_OFFERS,
} from "@/lib/nellies-launch";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Nellie's Southern Kitchen launch offers and Bourbon & Cigar Night — September 23, 7:00 PM ET.",
};

/**
 * Guest-visible events/offers surface so /events is not a 404.
 * Same Jackie launch set as /brands/nellies — do not expand.
 */
export default async function EventsPage() {
  const brand = await getBrandFromDb(NELLIES_BRAND_SLUG);
  const bourbon =
    brand?.upcoming.find((e) => /bourbon/i.test(e.title) && /cigar/i.test(e.title)) ??
    brand?.upcoming[0] ??
    null;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-white/60">Nellie&apos;s Southern Kitchen</p>
        <h1 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Launch offers &amp; events
        </h1>
        <p className="text-sm text-white/70">
          Jackie&apos;s three member perks plus Bourbon &amp; Cigar Night.{" "}
          <Link href="/brands/nellies" className="text-aurora underline underline-offset-2">
            Open the Nellie&apos;s brand page
          </Link>
          .
        </p>
      </header>

      <section id="offers" className="glass-card space-y-4 p-6">
        <p className="text-sm uppercase tracking-wide text-white/60">Launch offers</p>
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
        <div className="rounded-2xl bg-black/30 p-5">
          <p className="text-sm font-semibold">{bourbon?.title ?? NELLIES_BOURBON_TITLE}</p>
          {bourbon?.detail && (
            <p className="mt-1 text-xs text-white/70">{bourbon.detail}</p>
          )}
          <p className="mt-2 text-xs text-white/60">
            📍 {bourbon?.location || NELLIES_BOURBON_LOCATION}
          </p>
          <p className="mt-3 text-xs uppercase tracking-wide text-white/40">
            {bourbon?.date || NELLIES_BOURBON_WHEN}
          </p>
          <p className="mt-1 text-xs text-white/50">
            Cap {bourbon?.capacity ?? NELLIES_BOURBON_CAPACITY}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            href={`/login?next=${encodeURIComponent("/brands/nellies#upcoming")}`}
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-semibold text-white"
          >
            Sign in to RSVP
          </Link>
          <Link
            href={`/signup?ref=nellies&next=${encodeURIComponent("/brands/nellies#upcoming")}`}
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
