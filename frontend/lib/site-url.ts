/**
 * Canonical production origin for Brand Engage Pro.
 *
 * Email redirect targets (emailRedirectTo / resetPasswordForEmail),
 * metadataBase, OG, sitemap, and robots MUST use this www host.
 *
 * Never default to:
 *   - $VERCEL_URL
 *   - *.vercel.app (including brand-engage-pro.vercel.app)
 *   - apex https://brandengagepro.com (apex already 308s to www — keep that;
 *     do not use apex as a landing host or email redirect target)
 */
export const CANONICAL_PRODUCTION_ORIGIN = "https://www.brandengagepro.com";

export const CANONICAL_PRODUCTION_HOST = "www.brandengagepro.com";

/** Production aliases that must 308 to www + path + query. */
export const FORBIDDEN_LANDING_HOSTS = [
  "brand-engage-pro.vercel.app",
  "brandengagepro.com",
] as const;

type EnvLike = Record<string, string | undefined>;

function hostnameOf(value: string): string | null {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True for $VERCEL_URL / vercel.app / apex — forbidden email/canonical hosts. */
export function isForbiddenAppOrigin(value: string): boolean {
  const host = hostnameOf(value.trim());
  if (!host) return true;
  if (host === "brandengagepro.com") return true;
  if (host === "vercel.app" || host.endsWith(".vercel.app")) return true;
  return false;
}

/**
 * Resolve the public app origin.
 * Prefers NEXT_PUBLIC_APP_URL, then NEXT_PUBLIC_SITE_URL.
 * Never reads $VERCEL_URL. Forbidden hosts fall back to www.
 */
export function resolveAppUrl(env: EnvLike = process.env): string {
  const raw = (env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_SITE_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (!raw || isForbiddenAppOrigin(raw)) {
    return CANONICAL_PRODUCTION_ORIGIN;
  }
  return raw;
}

/**
 * If this request host is a forbidden landing host, return the www URL
 * (same path + query). Otherwise null — do not pin preview *.vercel.app.
 */
export function resolvePinnedCanonicalLocation(
  host: string | null | undefined,
  pathname: string,
  search = "",
): string | null {
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  if (
    hostname !== "brand-engage-pro.vercel.app" &&
    hostname !== "brandengagepro.com"
  ) {
    return null;
  }
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${CANONICAL_PRODUCTION_ORIGIN}${path}${search}`;
}
