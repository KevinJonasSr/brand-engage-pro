import Link from "next/link";
import type { Metadata } from "next";
import { getBrandFromDb } from "@/lib/data/brands";
import { listSpecialsForBrand } from "@/lib/data/specials";
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
  const [brand, specials] = await Promise.all([
    getBrandFromDb(NELLIES_BRAND_SLUG),
    listSpecialsForBrand(NELLIES_BRAND_SLUG),
  ]);

  const offers =
    specials.length > 0
      ? specials.map((s) => ({ title: s.title, description: s.description ?? "" }))
      : NELLIES_PUBLISHED_OFFERS.map((o) => ({
          title: o.title,
          description: o.description,
        }));

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
          {offers.map((offer) => (
            <li key={offer.title} className="rounded-2xl bg-black/30 p-5">
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
            📍 {bourbon?.location ?? NELLIES_BOURBON_LOCATION}
          </p>
          <p className="mt-3 text-xs uppercase tracking-wide text-white/40">
            {bourbon?.date || NELLIES_BOURBON_WHEN}
          </p>
          <p className="mt-1 text-xs text-white/50">
            Cap {bourbon?.capacity ?? NELLIES_BOURBON_CAPACITY}
          </p>
        </div>
        <Link
          href="/brands/nellies#upcoming"
          className="inline-block text-sm text-aurora underline underline-offset-2"
        >
          RSVP on the brand page →
        </Link>
      </section>
    </main>
  );
}
