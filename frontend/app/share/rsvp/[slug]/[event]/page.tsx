import { notFound } from "next/navigation";
import { type Metadata } from "next";
import Link from "next/link";
import { getBrandFromDb } from "@/lib/data/brands";
import { createAdminClient } from "@/lib/supabase/admin";
import ShareButton from "@/components/share-button";

export const dynamic = "force-static";
export const revalidate = 3600;

async function getEvent(eventId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("brand_events")
    .select("title, detail, event_date, location, url")
    .eq("id", eventId)
    .maybeSingle();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; event: string }>;
}): Promise<Metadata> {
  const { slug, event: eventId } = await params;
  const [brand, eventRow] = await Promise.all([
    getBrandFromDb(slug).catch(() => null),
    getEvent(eventId),
  ]);
  const brandName = brand?.name ?? "Brand Engage Pro";
  const eventTitle = eventRow?.title ?? "Event";
  const title = `Going to ${eventTitle} — ${brandName}`;
  const description = `RSVP confirmed for ${eventTitle} via Brand Engage Pro — the ${brandName} community app.`;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: `/share/rsvp/${slug}/${eventId}`,
      siteName: "Brand Engage Pro",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RsvpSharePage({
  params,
}: {
  params: Promise<{ slug: string; event: string }>;
}) {
  const { slug, event: eventId } = await params;
  const [brand, eventRow] = await Promise.all([
    getBrandFromDb(slug).catch(() => null),
    getEvent(eventId),
  ]);
  if (!brand) notFound();

  const eventTitle = eventRow?.title ?? "Event";
  const eventDate = eventRow?.event_date
    ? new Date(eventRow.event_date).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const location = eventRow?.location ?? null;
  const ticketUrl = eventRow?.url ?? null;

  const shareUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/share/rsvp/${slug}/${eventId}`
      : `https://brand-engage-pro.vercel.app/share/rsvp/${slug}/${eventId}`;
  const shareTitle = `I'm going to ${eventTitle}`;
  const shareText = `RSVP confirmed for ${eventTitle}${eventDate ? ` on ${eventDate}` : ""}${location ? ` at ${location}` : ""}. Join me: ${shareUrl}`;

  return (
    <main className="min-h-screen bg-[#050b1f] text-white flex flex-col items-center justify-center px-6 py-16">
      <div
        className="w-full max-w-lg rounded-2xl border border-white/20 p-8 flex flex-col items-center gap-6 text-center"
        style={{
          background:
            `radial-gradient(circle at 20% 15%, ${brand.accentFrom}66, transparent 55%), ` +
            `radial-gradient(circle at 80% 85%, ${brand.accentTo}66, transparent 60%), ` +
            "rgba(255,255,255,0.03)",
          boxShadow: `0 0 60px ${brand.accentFrom}22`,
        }}
      >
        <p className="text-[10px] tracking-[0.2em] uppercase text-white/30 font-medium">Brand Engage Pro</p>
        <div className="flex flex-col gap-1">
          <p className="text-xs tracking-widest uppercase text-white/50">I&apos;m going</p>
          <h1
            className="text-3xl font-bold"
            style={{
              background: `linear-gradient(135deg, ${brand.accentFrom}, ${brand.accentTo})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {eventTitle}
          </h1>
        </div>
        {(eventDate || location) && (
          <div className="flex flex-col items-center gap-1">
            {eventDate && <p className="text-white/80 text-sm font-medium">{eventDate}</p>}
            {location && <p className="text-white/50 text-sm">{location}</p>}
          </div>
        )}
        <p className="text-white/60 text-sm max-w-xs">
          RSVP confirmed via Brand Engage Pro — the {brand.name} community app.
        </p>
        <div className="flex flex-col gap-3 w-full">
          <ShareButton
            title={shareTitle}
            text={shareText}
            url={shareUrl}
            label="Invite friends"
            variant="primary"
          />
          {ticketUrl && (
            <a
              href={ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-sm text-white/50 hover:text-white transition-colors py-2"
            >
              Get tickets →
            </a>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Link
          href={`/brands/${brand.slug}`}
          className="text-sm text-white/50 hover:text-white transition-colors"
        >
          Visit brand experience →
        </Link>
      </div>
    </main>
  );
}
