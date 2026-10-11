import { ImageResponse } from "next/og";
import { ShareCard, eyebrowStyle, inkStyle, subStyle } from "@/components/og/share-card";
import { sharePalette } from "@/lib/brand-accent";
import { getBrandFromDb } from "@/lib/data/brands";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Leaderboard rank on Brand Engage Pro";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default async function RankOpengraphImage({
  params,
}: {
  params: { slug: string; rank: string };
}) {
  const brand = await getBrandFromDb(params.slug).catch(() => null);

  const brandName = brand?.name ?? "Brand Engage Pro";
  const palette = sharePalette(brand?.accentFrom, brand?.accentTo);
  const rankNum = parseInt(params.rank, 10);
  const rankDisplay = Number.isFinite(rankNum) && rankNum > 0 ? ordinal(rankNum) : params.rank;

  return new ImageResponse(
    (
      <ShareCard
        palette={palette}
        caption="Climbing the leaderboard earns exclusive rewards. Can you top the chart?"
        cta="Start earning →"
      >
        <div style={eyebrowStyle(palette)}>Leaderboard</div>
        <div style={{ ...inkStyle(palette, 200), lineHeight: 1 }}>{rankDisplay}</div>
        <div style={subStyle(palette)}>{brandName} member community</div>
      </ShareCard>
    ),
    { ...size },
  );
}
