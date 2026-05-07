import { ImageResponse } from "next/og";
import { getBrandFromDb } from "@/lib/data/brands";

// ─── Per-brand OG card ──────────────────────────────────────────────────
// Generated at request time so links to /brands/<slug> render with the
// brand's own identity: name + tagline laid over their accent gradient,
// with the hero photo as a watermarked background. 1200x630 — canonical
// Twitter/LinkedIn/Slack preview size.

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export const alt = "Brand on Brand Engage Pro";

export default async function BrandOpengraphImage({
  params,
}: {
  params: { slug: string };
}) {
  const brand = await getBrandFromDb(params.slug).catch(() => null);

  // Fall back to a clean branded card if the slug doesn't resolve. We
  // never want a 500 on the OG endpoint — broken share previews are
  // worse than a generic one.
  const name = brand?.name ?? "Brand Engage Pro";
  const tagline =
    brand?.tagline ?? "Skip the line. Earn the perks. Become a regular.";
  const accentFrom = brand?.accentFrom ?? "#7c3aed";
  const accentTo = brand?.accentTo ?? "#fb923c";
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
          background: "#050b1f",
          color: "white",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Hero image as background, dimmed. Wrapped in conditional so a
            missing hero gracefully falls back to gradient-only. */}
        {heroImage ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              backgroundImage: `url(${heroImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center top",
              opacity: 0.55,
            }}
          />
        ) : null}

        {/* Brand accent overlay — pulls the brand's accent colors into a
            corner-to-corner radial wash that keeps text legible. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              `radial-gradient(circle at 15% 10%, ${accentFrom}cc, transparent 55%), ` +
              `radial-gradient(circle at 85% 95%, ${accentTo}cc, transparent 60%), ` +
              "linear-gradient(180deg, rgba(5,11,31,0.35), rgba(5,11,31,0.85))",
          }}
        />

        {/* Brand mark — top-left "BEP" pill to anchor the design. */}
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
              background: `linear-gradient(135deg, ${accentFrom}, ${accentTo})`,
              fontSize: 22,
              fontWeight: 700,
              color: "white",
            }}
          >
            BEP
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              opacity: 0.9,
            }}
          >
            Brand Engage Pro
          </div>
        </div>

        {/* Headline block — brand name, then tagline. */}
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
              color: "rgba(255,255,255,0.7)",
            }}
          >
            Member Club
          </div>
          <div
            style={{
              fontSize: 110,
              fontWeight: 700,
              lineHeight: 0.98,
              letterSpacing: "-0.04em",
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
                letterSpacing: "-0.01em",
                maxWidth: 980,
                color: "rgba(255,255,255,0.92)",
                marginTop: 8,
              }}
            >
              {tagline}
            </div>
          ) : null}
        </div>

        {/* Footer row — "Become a regular" CTA pill. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            color: "rgba(255,255,255,0.85)",
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
                background: "#10b981",
              }}
            />
            Live · Earn perks · Skip the line
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 24px",
              borderRadius: 999,
              background: `linear-gradient(135deg, ${accentFrom}, ${accentTo})`,
              fontWeight: 600,
              color: "white",
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
