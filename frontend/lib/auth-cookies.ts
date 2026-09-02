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

const AUTH_TOKEN_RE = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i;
const AUTH_VERIFIER_RE = /^sb-[a-z0-9]+-auth-token-code-verifier$/i;

export function isAuthSignOutPath(pathname: string): boolean {
  return (
    pathname === "/logout" ||
    pathname === "/signout" ||
    pathname === "/auth/signout"
  );
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
