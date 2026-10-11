/**
 * Per-brand accent palette for the linen look.
 *
 * A brand's two stored colors (accentFrom / accentTo) become a small, safe
 * palette: one accent for buttons and fills, a darker ink of it for text on
 * linen, the right text color to sit on the accent, and a deep color for the
 * hero when there is no photo. Every pair is checked against WCAG contrast so
 * a brand can't pick colors that make its own page unreadable.
 *
 * Pure functions only. No React, no DB.
 */

export const LINEN = "#f5efe4";
export const IRON = "#1e1b17";

/** BEP's own pair (aurora gold, ember crimson), used when a brand has none. */
export const BEP_ACCENT_FROM = "#d4a017";
export const BEP_ACCENT_TO = "#9b2335";

/**
 * Colors the fan-app fork shipped as placeholders. A brand still on one of
 * these never chose them, so it gets BEP's own pair instead.
 */
const FORK_DEFAULT_PAIRS = new Set([
  "#7c3aed|#f97316",
  "#7c3aed|#fb923c",
  "#ec4899|#7c2d92",
  "#f59e0b|#ea580c",
  "#14b8a6|#2563eb",
]);

const TEXT_CONTRAST = 4.5;
const HERO_CONTRAST = 7;
/** Below this chroma (0..1) a color reads as grey/black/white, not a hue. */
const NEUTRAL_CHROMA = 0.12;
const DARKEN_STEP = 0.04;

export type BrandAccent = {
  /** Fill color for buttons, bars, stamps. */
  accent: string;
  /** The accent darkened until it passes 4.5:1 as text on linen. */
  accentInk: string;
  /** Text color to put on top of `accent` (linen or iron). */
  onAccent: string;
  /** Dark hero background that keeps linen text at 7:1 or better. */
  deep: string;
  /** True when the brand's own colors were missing, invalid or fork placeholders. */
  isBepDefault: boolean;
};

type Rgb = readonly [number, number, number];

/** "#abc" or "#aabbcc" (any case) → "#aabbcc", anything else → null. */
export function normalizeHex(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  const raw = m[1].toLowerCase();
  const full = raw.length === 3 ? [...raw].map((c) => c + c).join("") : raw;
  return `#${full}`;
}

function toRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function channelLuminance(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG contrast ratio between two hex colors (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function chroma(hex: string): number {
  const rgb = toRgb(hex);
  return (Math.max(...rgb) - Math.min(...rgb)) / 255;
}

/** Mix toward black in small steps until `hex` reaches `ratio` against `against`. */
export function darkenUntil(hex: string, against: string, ratio: number): string {
  const base = toRgb(hex);
  for (let amount = 0; amount <= 1; amount += DARKEN_STEP) {
    const candidate = toHex([base[0] * (1 - amount), base[1] * (1 - amount), base[2] * (1 - amount)]);
    if (contrastRatio(candidate, against) >= ratio) return candidate;
  }
  return "#000000";
}

/** Append an alpha (0..1) to a 6-digit hex: ("#d4a857", 0.2) → "#d4a85733". */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex}${a.toString(16).padStart(2, "0")}`;
}

function resolvePair(from: string | null, to: string | null): { from: string; to: string; isBepDefault: boolean } {
  if (!from || !to || FORK_DEFAULT_PAIRS.has(`${from}|${to}`)) {
    return { from: BEP_ACCENT_FROM, to: BEP_ACCENT_TO, isBepDefault: true };
  }
  return { from, to, isBepDefault: false };
}

/**
 * Build the palette from a brand's stored pair. The more colorful of the two
 * becomes the accent. When both are neutral (black and grey, say) the darker
 * one is the accent, so the page stays crisp rather than muddy.
 */
export function resolveBrandAccent(
  accentFrom: string | null | undefined,
  accentTo: string | null | undefined,
): BrandAccent {
  const { from, to, isBepDefault } = resolvePair(normalizeHex(accentFrom), normalizeHex(accentTo));

  const bothNeutral = chroma(from) < NEUTRAL_CHROMA && chroma(to) < NEUTRAL_CHROMA;
  const fromIsAccent = bothNeutral
    ? relativeLuminance(from) <= relativeLuminance(to)
    : chroma(from) >= chroma(to);
  const picked = fromIsAccent ? from : to;
  const other = fromIsAccent ? to : from;

  // Mid-tones (pure red, say) pass with neither linen nor iron, so darken the
  // fill until linen text on it reads.
  const pickedOn = contrastRatio(picked, LINEN) >= contrastRatio(picked, IRON) ? LINEN : IRON;
  const fits = contrastRatio(picked, pickedOn) >= TEXT_CONTRAST;
  const accent = fits ? picked : darkenUntil(picked, LINEN, TEXT_CONTRAST);
  const onAccent = fits ? pickedOn : LINEN;
  // The hero is dark, so start from whichever of the pair is darker.
  const deepBase = relativeLuminance(other) <= relativeLuminance(accent) ? other : accent;

  return {
    accent,
    accentInk: darkenUntil(accent, LINEN, TEXT_CONTRAST),
    onAccent,
    deep: darkenUntil(deepBase, LINEN, HERO_CONTRAST),
    isBepDefault,
  };
}

/** Hero background for a brand with no photo: deep color with an accent glow top-right. */
export function brandHeroBackground(p: BrandAccent): string {
  return `radial-gradient(120% 90% at 100% 0%, ${withAlpha(p.accent, 0.35)} 0%, transparent 55%), linear-gradient(160deg, ${p.deep}, ${darkenUntil(p.deep, LINEN, 12)})`;
}

/** Light header band for subpages: linen with a soft accent wash. Iron text stays readable. */
export function brandWashBackground(p: BrandAccent): string {
  return `radial-gradient(110% 120% at 100% 0%, ${withAlpha(p.accent, 0.2)} 0%, transparent 60%), linear-gradient(${LINEN}, ${LINEN})`;
}

/** Paint `fg` over `bg` at `alpha` (0..1) and return the solid color you'd see. */
export function blend(fg: string, bg: string, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  const f = toRgb(fg);
  const b = toRgb(bg);
  return toHex([f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a)]);
}

/** Iron hairline used for paper-card borders and image frames. */
export const HAIRLINE = "rgba(30, 27, 23, 0.14)";

export type SharePalette = BrandAccent & {
  /** Page color for share cards and emails. */
  paper: string;
  /** Body text. */
  text: string;
  /** Captions and secondary lines; still 4.5:1 on paper. */
  muted: string;
  /** Soft accent glow for the corners of a share card. */
  wash: string;
};

/**
 * Colors for share images (OpenGraph cards) and emails: linen paper, iron
 * text, the brand's accent as a fill and its ink for big numbers and names.
 */
export function sharePalette(
  accentFrom: string | null | undefined,
  accentTo: string | null | undefined,
): SharePalette {
  const p = resolveBrandAccent(accentFrom, accentTo);
  return {
    ...p,
    paper: LINEN,
    text: IRON,
    muted: blend(IRON, LINEN, 0.72),
    wash: `radial-gradient(circle at 8% 0%, ${withAlpha(p.accent, 0.24)} 0%, transparent 55%), radial-gradient(circle at 100% 100%, ${withAlpha(p.accent, 0.14)} 0%, transparent 50%)`,
  };
}
