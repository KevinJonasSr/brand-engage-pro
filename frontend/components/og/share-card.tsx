import type { CSSProperties, ReactNode } from "react";
import { HAIRLINE, type SharePalette } from "@/lib/brand-accent";

// ─── Linen share card ───────────────────────────────────────────────────
// Shared frame for every 1200x630 OpenGraph image: linen paper with a soft
// accent glow, one iron hairline, the BE mark top-left, a caption and an
// accent pill along the bottom. Each route only fills the middle.
// Satori rule: every div with more than one child needs display: flex.

export function ShareCard({
  palette,
  caption,
  cta,
  children,
  align = "center",
}: {
  palette: SharePalette;
  caption: ReactNode;
  cta: string;
  children: ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "70px",
        background: palette.paper,
        color: palette.text,
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", inset: 0, display: "flex", background: palette.wash }} />
      <div
        style={{
          position: "absolute",
          inset: 32,
          display: "flex",
          border: `2px solid ${HAIRLINE}`,
          borderRadius: 8,
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
        <div
          style={{
            display: "flex",
            width: 52,
            height: 52,
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
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em" }}>Brand Engage Pro</div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: align === "center" ? "center" : "flex-start",
          justifyContent: "center",
          gap: 18,
          position: "relative",
          textAlign: align === "center" ? "center" : "left",
        }}
      >
        {children}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          fontSize: 22,
          color: palette.muted,
          position: "relative",
        }}
      >
        <div style={{ display: "flex", maxWidth: 720 }}>{caption}</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 22px",
            borderRadius: 999,
            background: palette.accent,
            color: palette.onAccent,
            fontWeight: 600,
          }}
        >
          {cta}
        </div>
      </div>
    </div>
  );
}

/** Small uppercase label above the headline. */
export function eyebrowStyle(palette: SharePalette): CSSProperties {
  return {
    fontSize: 26,
    fontWeight: 500,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    color: palette.accentInk,
  };
}

/** Big headline in the brand's ink (solid, so it passes 4.5:1 on linen). */
export function inkStyle(palette: SharePalette, fontSize: number): CSSProperties {
  return {
    fontSize,
    fontWeight: 800,
    lineHeight: 1.05,
    letterSpacing: "-0.03em",
    color: palette.accentInk,
  };
}

/** Secondary line under the headline. */
export function subStyle(palette: SharePalette, fontSize = 30): CSSProperties {
  return { fontSize, fontWeight: 500, color: palette.muted };
}
