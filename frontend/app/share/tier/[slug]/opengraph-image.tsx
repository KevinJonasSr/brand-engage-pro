import { ImageResponse } from "next/og";
import { ShareCard, eyebrowStyle, inkStyle } from "@/components/og/share-card";
import { sharePalette } from "@/lib/brand-accent";
import { getBrandFromDb } from "@/lib/data/brands";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Member tier on Brand Engage Pro";

export default async function TierOpengraphImage({
  params,
}: {
  params: { slug: string };
}) {
  const brand = await getBrandFromDb(params.slug).catch(() => null);

  const brandName = brand?.name ?? "Brand Engage Pro";
  const palette = sharePalette(brand?.accentFrom, brand?.accentTo);

  return new ImageResponse(
    (
      <ShareCard
        palette={palette}
        caption="Unlocked a new member tier: exclusive rewards, early access, and more."
        cta="Join →"
      >
        <div style={{ fontSize: 120, lineHeight: 1, color: palette.accentInk }}>★</div>
        <div style={eyebrowStyle(palette)}>Gold Member</div>
        <div style={{ ...inkStyle(palette, 52), color: palette.text, fontWeight: 700 }}>{brandName}</div>
      </ShareCard>
    ),
    { ...size },
  );
}
