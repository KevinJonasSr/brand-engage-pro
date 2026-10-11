import { ImageResponse } from "next/og";
import { LINEN, brandHeroBackground, sharePalette, withAlpha } from "@/lib/brand-accent";
import { getBrandFromDb } from "@/lib/data/brands";

// ─── Per-brand OG card ──────────────────────────────────────────────────
// Generated at request time so links to /brands/<slug> render with the
// brand's own identity: name and tagline in linen over the hero photo,
// darkened with the brand's deep color so the text always reads. Brands
// with no photo get the same deep hero the page uses. 1200x630, the
// canonical Twitter/LinkedIn/Slack preview size.

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export const alt = "Brand on Brand Engage Pro";

const SAGE = "#7E8B6A";

export default async function BrandOpengraphImage({
  params,
}: {
  params: { slug: string };
}) {
  const brand = await getBrandFromDb(params.slug).catch(() => null);

  // Fall back to a clean branded card if the slug doesn't resolve. We
  // never want a 500 on the OG endpoint; broken share previews are
  // worse than a generic one.
  const name = brand?.name ?? "Brand Engage Pro";
  const tagline =
    brand?.tagline ?? "Skip the line. Earn the perks. Become a regular.";
  const palette = sharePalette(brand?.accentFrom, brand?.accentTo);
  const heroImage = brand?.heroImage ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "80px",
          background: brandHeroBackground(palette),
          color: LINEN,
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Hero photo, when the brand has one. */}
        {heroImage ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              backgroundImage: `url(${heroImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center top",
            }}
          />
        ) : null}

        {/* Deep scrim so linen text holds up over any photo. */}
        {heroImage ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              background: `linear-gradient(180deg, ${withAlpha(palette.deep, 0.55)}, ${withAlpha(palette.deep, 0.92)})`,
            }}
          />
        ) : null}

        {/* Brand mark, top-left. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 56,
              height: 56,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              background: palette.accent,
              color: palette.onAccent,
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            BE
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            Brand Engage Pro
          </div>
        </div>

        {/* Headline block: brand name, then tagline. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              opacity: 0.85,
            }}
          >
            Member Club
          </div>
          <div
            style={{
              fontSize: 110,
              fontWeight: 700,
              lineHeight: 0.98,
              letterSpacing: "-0.03em",
              maxWidth: 1040,
            }}
          >
            {name}
          </div>
          {tagline ? (
            <div
              style={{
                fontSize: 32,
                fontWeight: 400,
                lineHeight: 1.25,
                maxWidth: 980,
                marginTop: 8,
              }}
            >
              {tagline}
            </div>
          ) : null}
        </div>

        {/* Footer row: live dot and the "Become a regular" pill. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            position: "relative",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: 999,
                background: SAGE,
              }}
            />
            Live · Earn perks · Skip the line
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "12px 24px",
              borderRadius: 999,
              background: palette.accent,
              color: palette.onAccent,
              fontWeight: 600,
            }}
          >
            Become a regular →
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
