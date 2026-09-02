/**
 * Auth cookie helpers for www vs apex leftovers and chunked sb-* keys.
 *
 * Walk evidence: header Sign out / `/logout` can clear one store while a
 * second `sb-<ref>-auth-token` (host-only www vs Domain=.brandengagepro.com,
 * or leftover `.0`/`.1` chunks from another walk account) is still sent.
 * Middleware `getUser()` then refreshes that leftover → session resurrects
 * or silently swaps 0902x → 0902rw.
 */

export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
};

/** Sticky logout — leftover sb-* must not be adopted for 30 minutes. */
export const SIGNED_OUT_COOKIE = "bep_signed_out";
export const SIGNED_OUT_MAX_AGE = 30 * 60;

/** Durable onboarding gate — finished profiles skip the blank wizard. */
export const ONBOARDED_COOKIE = "bep_onboarded";
export const ONBOARDED_MAX_AGE = 60 * 60 * 24 * 365;

const AUTH_TOKEN_RE = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i;
const AUTH_VERIFIER_RE = /^sb-[a-z0-9]+-auth-token-code-verifier$/i;

export function isAuthSignOutPath(pathname: string): boolean {
  return (
    pathname === "/logout" ||
    pathname === "/signout" ||
    pathname === "/auth/signout"
  );
}

export function isAuthPublicPath(pathname: string): boolean {
  return (
    pathname === "/signup" ||
    pathname === "/login" ||
    pathname === "/join" ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/signup/") ||
    pathname.startsWith("/login/")
  );
}

export function isSignedOutMarkerValue(value: string | undefined | null): boolean {
  return value === "1" || value === "true";
}

export function isOnboardedMarkerValue(value: string | undefined | null): boolean {
  return value === "1" || value === "true";
}

/**
 * Proxy / server must not call getUser() or write sb-* while this is true.
 * Covers /logout, /signup, /login, and the sticky signed-out window so a
 * leftover N24 refresh cannot remint cookies onto prefetch or /signup.
 */
export function shouldSkipSessionRefresh(
  pathname: string,
  signedOut: boolean,
): boolean {
  return isAuthSignOutPath(pathname) || isAuthPublicPath(pathname) || signedOut;
}

export function shouldRedirectOnboardingHome(
  pathname: string,
  onboarded: boolean,
  signedOut: boolean,
): boolean {
  return pathname === "/onboarding" && onboarded && !signedOut;
}

export function flowCookieHeader(
  name: string,
  value: string,
  maxAge: number,
  secure = false,
): string {
  const parts = [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function isSecureAuthHost(hostname: string): boolean {
  const host = hostname.split(":")[0].toLowerCase();
  return host !== "localhost" && host !== "127.0.0.1";
}

export function stampSignedOutCookie(
  response: { headers: { append: (name: string, value: string) => void } },
  hostname: string,
): void {
  response.headers.append(
    "Set-Cookie",
    flowCookieHeader(
      SIGNED_OUT_COOKIE,
      "1",
      SIGNED_OUT_MAX_AGE,
      isSecureAuthHost(hostname),
    ),
  );
}

export function clearSignedOutCookie(
  response: { headers: { append: (name: string, value: string) => void } },
  hostname: string,
): void {
  response.headers.append(
    "Set-Cookie",
    expireAuthCookieHeader(SIGNED_OUT_COOKIE, undefined, isSecureAuthHost(hostname)),
  );
}

export function stampOnboardedCookie(
  response: { cookies?: { set: (name: string, value: string, options: Record<string, unknown>) => void } },
): void {
  response.cookies?.set(ONBOARDED_COOKIE, "1", {
    path: "/",
    maxAge: ONBOARDED_MAX_AGE,
    sameSite: "lax",
  });
}

export function clearOnboardedCookie(
  response: { headers: { append: (name: string, value: string) => void } },
  hostname: string,
): void {
  response.headers.append(
    "Set-Cookie",
    expireAuthCookieHeader(ONBOARDED_COOKIE, undefined, isSecureAuthHost(hostname)),
  );
}

export function readBrowserCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

export function writeBrowserFlowCookie(
  name: string,
  value: string,
  maxAge: number,
): void {
  if (typeof document === "undefined") return;
  const secure = isSecureAuthHost(window.location.hostname);
  document.cookie = flowCookieHeader(name, value, maxAge, secure);
}

export function stampBrowserSignedOut(): void {
  writeBrowserFlowCookie(SIGNED_OUT_COOKIE, "1", SIGNED_OUT_MAX_AGE);
}

export function clearBrowserSignedOut(): void {
  if (typeof document === "undefined") return;
  document.cookie = expireAuthCookieHeader(
    SIGNED_OUT_COOKIE,
    undefined,
    isSecureAuthHost(window.location.hostname),
  );
}

export function clearBrowserOnboarded(): void {
  if (typeof document === "undefined") return;
  document.cookie = expireAuthCookieHeader(
    ONBOARDED_COOKIE,
    undefined,
    isSecureAuthHost(window.location.hostname),
  );
}

export function hasBrowserSignedOutMarker(): boolean {
  return isSignedOutMarkerValue(readBrowserCookie(SIGNED_OUT_COOKIE));
}

export function isAuthCookieName(name: string): boolean {
  return AUTH_TOKEN_RE.test(name) || AUTH_VERIFIER_RE.test(name);
}

/** Live BEP project — always expire these names even if env is unset. */
export const BEP_SUPABASE_PROJECT_REF = "enfpviapxvqyoarwwsuf";

export function supabaseAuthCookieBaseName(
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string {
  if (supabaseUrl) {
    try {
      const host = new URL(supabaseUrl).hostname;
      const ref = host.split(".")[0];
      if (ref) return `sb-${ref}-auth-token`;
    } catch {
      // fall through to the live project ref
    }
  }
  return `sb-${BEP_SUPABASE_PROJECT_REF}-auth-token`;
}

export function collectAuthCookieNames(cookieNames: string[]): string[] {
  const names = new Set<string>();
  for (const name of cookieNames) {
    if (isAuthCookieName(name)) names.add(name);
  }
  const base = supabaseAuthCookieBaseName();
  names.add(base);
  names.add(`${base}.0`);
  names.add(`${base}.1`);
  names.add(`${base}.2`);
  names.add(`${base}-code-verifier`);
  return [...names];
}

export function authCookieExpireDomains(
  hostname: string,
): Array<string | undefined> {
  const host = hostname.split(":")[0].toLowerCase();
  const domains: Array<string | undefined> = [undefined];
  if (host === "brandengagepro.com" || host.endsWith(".brandengagepro.com")) {
    domains.push("brandengagepro.com");
    domains.push(".brandengagepro.com");
  }
  return domains;
}

export function expireAuthCookieHeader(
  name: string,
  domain?: string,
  secure = false,
): string {
  const parts = [
    `${name}=`,
    "Path=/",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join("; ");
}

export function expireAuthCookiesOnResponse(
  response: { headers: { append: (name: string, value: string) => void } },
  cookieNames: string[],
  hostname: string,
): void {
  const host = hostname.split(":")[0].toLowerCase();
  const secure = host !== "localhost" && host !== "127.0.0.1";
  const names = collectAuthCookieNames(cookieNames);
  const domains = authCookieExpireDomains(hostname);
  for (const name of names) {
    for (const domain of domains) {
      response.headers.append(
        "Set-Cookie",
        expireAuthCookieHeader(name, domain, secure),
      );
    }
  }
}

export function clearBrowserAuthStorage(): void {
  if (typeof document === "undefined") return;
  const seen = document.cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter(Boolean);
  const names = collectAuthCookieNames(seen);
  const host = window.location.hostname;
  const secure = host !== "localhost" && host !== "127.0.0.1";
  const domains = authCookieExpireDomains(host);
  for (const name of names) {
    for (const domain of domains) {
      document.cookie = expireAuthCookieHeader(name, domain, secure);
    }
  }
  for (const store of [window.localStorage, window.sessionStorage]) {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && (key.startsWith("sb-") || key.includes("supabase.auth"))) {
        keys.push(key);
      }
    }
    for (const key of keys) store.removeItem(key);
  }
}
