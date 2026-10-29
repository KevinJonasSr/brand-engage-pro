/**
 * Redemption short codes — pure helpers shared by the member wallet
 * (/me/redemptions), the member card (/me/card) and staff lookup
 * (/admin/redemptions/[code]). No Next.js or Supabase imports so this
 * runs under `node --test`.
 *
 * The database assigns the code (migration 0084, trigger
 * assign_redemption_short_code). The JS generator here exists for tests,
 * previews and any future client-side pre-allocation; both use the same
 * alphabet and length.
 */

/** Unambiguous alphabet: no 0/O, no 1/I. 32 symbols. */
export const SHORT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SHORT_CODE_LENGTH = 6;

const ALPHABET_RE = new RegExp(`^[${SHORT_CODE_ALPHABET}]{${SHORT_CODE_LENGTH}}$`);

/**
 * Generate a code. `rng` returns a float in [0, 1) and defaults to
 * Math.random; inject a deterministic one in tests.
 */
export function generateShortCode(rng: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    const r = rng();
    const idx = Math.min(
      SHORT_CODE_ALPHABET.length - 1,
      Math.max(0, Math.floor(r * SHORT_CODE_ALPHABET.length)),
    );
    out += SHORT_CODE_ALPHABET[idx];
  }
  return out;
}

/**
 * Clean up whatever a staff member typed or a scanner produced: trims,
 * uppercases and drops spaces, dashes, dots and underscores. Does not
 * validate; pair with isValidShortCode. Look-alikes (0/O, 1/I) are not
 * remapped because the alphabet excludes all four, so a code containing
 * one is simply invalid and the UI says so.
 *
 * Also accepts a full lookup URL (…/admin/redemptions/K7M3PX) and keeps
 * the last path segment, so a scanned QR pasted into the search box works.
 */
export function normalizeShortCode(input: string | null | undefined): string {
  let s = (input ?? "").trim();
  if (!s) return "";
  // A pasted URL: keep the last non-empty path segment.
  if (/^https?:\/\//i.test(s) || s.includes("/")) {
    const parts = s.split(/[?#]/)[0].split("/").filter(Boolean);
    s = parts[parts.length - 1] ?? "";
  }
  return s.toUpperCase().replace(/[\s\-_.]/g, "");
}

/** True when `code` is exactly six symbols from the alphabet. */
export function isValidShortCode(code: string | null | undefined): boolean {
  if (typeof code !== "string") return false;
  return ALPHABET_RE.test(code);
}

/** Display form: "K7M 3PX" (easier to read aloud at the counter). */
export function formatShortCode(code: string): string {
  const c = normalizeShortCode(code);
  if (c.length !== SHORT_CODE_LENGTH) return c;
  return `${c.slice(0, 3)} ${c.slice(3)}`;
}

/** Public base URL for QR payloads; falls back to the production host. */
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = (env.NEXT_PUBLIC_APP_URL ?? "").trim();
  const base = raw || "https://brand-engage-pro.vercel.app";
  return base.replace(/\/+$/, "");
}

/** URL a staff phone lands on when it scans a wallet QR. */
export function codeLookupUrl(code: string, base: string = appBaseUrl()): string {
  return `${base.replace(/\/+$/, "")}/admin/redemptions/${encodeURIComponent(normalizeShortCode(code))}`;
}

/** URL encoded in the member card QR (the member's public profile). */
export function memberCardUrl(memberId: string, base: string = appBaseUrl()): string {
  return `${base.replace(/\/+$/, "")}/members/${encodeURIComponent(memberId)}`;
}

// ─── Wallet model ───────────────────────────────────────────────────────────

export type WalletStatus =
  | "pending" // reward redemption awaiting staff
  | "fulfilled"
  | "cancelled"
  | "unused" // perk granted, not yet used
  | "used"; // perk marked used

export interface WalletItem {
  kind: "redemption" | "perk";
  id: string;
  code: string | null;
  brandSlug: string | null;
  brandName: string;
  title: string;
  status: WalletStatus;
  /** ISO timestamp the item was created / granted. */
  createdAt: string;
  /** ISO timestamp it was fulfilled, cancelled or used. */
  resolvedAt: string | null;
  note: string | null;
}

/** Items the member can still show at the counter. */
export function isActiveWalletItem(item: Pick<WalletItem, "status">): boolean {
  return item.status === "pending" || item.status === "unused";
}

/**
 * Split a wallet into what to show first (active, newest first) and the
 * collapsed history (resolved, newest resolution first).
 */
export function partitionWallet<T extends Pick<WalletItem, "status" | "createdAt" | "resolvedAt">>(
  items: readonly T[],
): { active: T[]; history: T[] } {
  const active: T[] = [];
  const history: T[] = [];
  for (const item of items) {
    (isActiveWalletItem(item) ? active : history).push(item);
  }
  const ts = (v: string | null) => (v ? Date.parse(v) || 0 : 0);
  active.sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
  history.sort(
    (a, b) => ts(b.resolvedAt ?? b.createdAt) - ts(a.resolvedAt ?? a.createdAt),
  );
  return { active, history };
}

/** Member-facing label for a status. Brand-neutral. */
export function walletStatusLabel(status: WalletStatus): string {
  switch (status) {
    case "pending":
      return "Ready to redeem";
    case "unused":
      return "Ready to use";
    case "fulfilled":
      return "Redeemed";
    case "used":
      return "Used";
    case "cancelled":
      return "Cancelled";
  }
}

/**
 * Human titles for member_perks.perk_slug. Perks are not catalog SKUs so
 * there is no table to join; unknown slugs fall back to a readable form
 * of the slug itself ("nsk-free-coffee" → "Free coffee").
 */
const PERK_TITLES: Record<string, string> = {
  "nsk-welcome-dessert": "Free Dessert w/ Entree",
  "nsk-birthday-entree": "Birthday Entree up to $30",
};

export function perkTitle(slug: string | null | undefined): string {
  const s = (slug ?? "").trim();
  if (!s) return "Member perk";
  if (PERK_TITLES[s]) return PERK_TITLES[s];
  const words = s
    .replace(/^nsk-/, "")
    .split(/[-_]+/)
    .filter(Boolean);
  if (words.length === 0) return "Member perk";
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
