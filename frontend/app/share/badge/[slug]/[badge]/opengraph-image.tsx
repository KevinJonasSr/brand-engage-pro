import { ImageResponse } from "next/og";
import { ShareCard, eyebrowStyle, inkStyle, subStyle } from "@/components/og/share-card";
import { sharePalette } from "@/lib/brand-accent";
import { getBrandFromDb } from "@/lib/data/brands";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Badge unlocked on Brand Engage Pro";

export default async function BadgeOpengraphImage({
  params,
}: {
  params: { slug: string; badge: string };
}) {
  const [brand, badgeRow] = await Promise.all([
    getBrandFromDb(params.slug).catch(() => null),
    (async () => {
      const admin = createAdminClient();
      const { data } = await admin
        .from("badges")
        .select("name, description, icon")
        .eq("slug", params.badge)
        .maybeSingle();
      return data;
    })(),
  ]);

  const brandName = brand?.name ?? "Brand Engage Pro";
  const palette = sharePalette(brand?.accentFrom, brand?.accentTo);
  const badgeName = badgeRow?.name ?? "Badge";
  const badgeIcon = badgeRow?.icon ?? "🏆";
  const badgeDesc = badgeRow?.description ?? "Earned on Brand Engage Pro";

  return new ImageResponse(
    (
      <ShareCard palette={palette} caption={badgeDesc} cta="Earn yours →">
        <div style={{ fontSize: 110, lineHeight: 1 }}>{badgeIcon}</div>
        <div style={eyebrowStyle(palette)}>Badge Unlocked</div>
        <div style={{ ...inkStyle(palette, 64), maxWidth: 1000 }}>{badgeName}</div>
        <div style={subStyle(palette)}>for {brandName}</div>
      </ShareCard>
    ),
    { ...size },
  );
}
