import { ImageResponse } from "next/og";
import { ShareCard, eyebrowStyle, inkStyle, subStyle } from "@/components/og/share-card";
import { sharePalette } from "@/lib/brand-accent";
import { getBrandFromDb } from "@/lib/data/brands";

// ─── Founder share card OG ──────────────────────────────────────────────
// "I'm Founding Member #N of <Brand>" certificate-style card. Generated
// when a member shares /share/founder/<slug>/<number>, so the URL becomes
// a linen preview in iMessage/Slack/Twitter. 1200x630.

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export const alt = "Founder badge on Brand Engage Pro";

export default async function FounderOpengraphImage({
  params,
}: {
  params: { slug: string; number: string };
}) {
  const brand = await getBrandFromDb(params.slug).catch(() => null);
  const number = parseInt(params.number, 10);

  const brandName = brand?.name ?? "Brand Engage Pro";
  const palette = sharePalette(brand?.accentFrom, brand?.accentTo);
  const founderNumber = Number.isFinite(number) && number > 0 ? number : 1;

  return new ImageResponse(
    (
      <ShareCard
        palette={palette}
        caption="One of 100 founding members. Limited tier: perks multiplier, early specials, members-only experiences."
        cta="Claim yours →"
      >
        <div style={eyebrowStyle(palette)}>Founding Member</div>
        <div style={{ ...inkStyle(palette, 220), lineHeight: 1 }}>#{founderNumber}</div>
        <div style={subStyle(palette, 36)}>of {brandName}</div>
      </ShareCard>
    ),
    { ...size },
  );
}
