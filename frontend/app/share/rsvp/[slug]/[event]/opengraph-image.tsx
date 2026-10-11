import { ImageResponse } from "next/og";
import { ShareCard, eyebrowStyle, inkStyle, subStyle } from "@/components/og/share-card";
import { sharePalette } from "@/lib/brand-accent";
import { getBrandFromDb } from "@/lib/data/brands";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "RSVP confirmed on Brand Engage Pro";

export default async function RsvpOpengraphImage({
  params,
}: {
  params: { slug: string; event: string };
}) {
  const [brand, eventRow] = await Promise.all([
    getBrandFromDb(params.slug).catch(() => null),
    (async () => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("brand_events")
        .select("title, detail, event_date, location")
        .eq("id", params.event)
        .maybeSingle();
      return data;
    })(),
  ]);

  const brandName = brand?.name ?? "Brand Engage Pro";
  const palette = sharePalette(brand?.accentFrom, brand?.accentTo);
  const eventTitle = eventRow?.title ?? "Upcoming Event";
  const eventDate = eventRow?.event_date
    ? new Date(eventRow.event_date).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const location = eventRow?.location ?? null;

  return new ImageResponse(
    (
      <ShareCard
        palette={palette}
        caption={`RSVP confirmed via Brand Engage Pro, the ${brandName} member community app.`}
        cta="Get tickets →"
      >
        <div style={eyebrowStyle(palette)}>I&apos;m going</div>
        <div style={{ ...inkStyle(palette, 68), maxWidth: 1000 }}>{eventTitle}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          {eventDate && <div style={{ ...subStyle(palette), color: palette.text }}>{eventDate}</div>}
          {location && <div style={subStyle(palette, 24)}>{location}</div>}
        </div>
      </ShareCard>
    ),
    { ...size },
  );
}
