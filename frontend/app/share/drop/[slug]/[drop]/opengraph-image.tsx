import { ImageResponse } from "next/og";
import { ShareCard, eyebrowStyle, inkStyle, subStyle } from "@/components/og/share-card";
import { sharePalette } from "@/lib/brand-accent";
import { getBrandFromDb } from "@/lib/data/brands";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Exclusive member drop on Brand Engage Pro";

export default async function DropOpengraphImage({
  params,
}: {
  params: { slug: string; drop: string };
}) {
  const brand = await getBrandFromDb(params.slug).catch(() => null);

  const brandName = brand?.name ?? "Brand Engage Pro";
  const palette = sharePalette(brand?.accentFrom, brand?.accentTo);

  const dropLabel = decodeURIComponent(params.drop)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return new ImageResponse(
    (
      <ShareCard
        palette={palette}
        caption="Members get first access to new offers on Brand Engage Pro."
        cta="Unlock access →"
      >
        <div style={{ fontSize: 110, lineHeight: 1 }}>🎁</div>
        <div style={eyebrowStyle(palette)}>Member Drop</div>
        <div style={{ ...inkStyle(palette, 68), maxWidth: 1000 }}>{dropLabel}</div>
        <div style={subStyle(palette)}>from {brandName}</div>
      </ShareCard>
    ),
    { ...size },
  );
}
