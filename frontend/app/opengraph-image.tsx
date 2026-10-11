import { ImageResponse } from "next/og";
import { ShareCard } from "@/components/og/share-card";
import { sharePalette } from "@/lib/brand-accent";

// ─── OG card for every page that doesn't override it ──────────────────────
// 1200x630 is the canonical Twitter/LinkedIn/Slack preview size. Generated at
// request time via Next's ImageResponse so we don't have to ship a binary.

export const runtime = "edge";
export const alt = "Brand Engage Pro, the member-loyalty platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEADLINE = {
  fontSize: 84,
  fontWeight: 700,
  lineHeight: 1.02,
  letterSpacing: "-0.035em",
  maxWidth: 980,
} as const;

export default async function OpengraphImage() {
  const palette = sharePalette(null, null);

  return new ImageResponse(
    (
      <ShareCard
        palette={palette}
        align="start"
        caption="The member-loyalty platform: rewards, community, drops."
        cta="Join free →"
      >
        <div style={{ ...HEADLINE, color: palette.text }}>Your favorite brands.</div>
        <div style={{ ...HEADLINE, color: palette.accentInk }}>Your member&apos;s table.</div>
      </ShareCard>
    ),
    { ...size },
  );
}
