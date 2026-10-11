/**
 * Password recovery links from Supabase (dashboard "Send password recovery"
 * or /recover) land on the Site URL with the session in the URL hash:
 *   #access_token=...&refresh_token=...&type=recovery
 * Our browser client uses the PKCE flow, which ignores hash tokens, so the
 * reset page saw "Auth session missing!". These helpers read the hash so
 * the page can set the session itself. Pure module, no imports.
 */

export const RESET_PASSWORD_PATH = "/reset-password";

export type RecoveryHash =
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "error"; message: string };

export function parseRecoveryHash(hash: string): RecoveryHash | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

  const error = params.get("error_description") ?? params.get("error");
  if (error) return { kind: "error", message: error };

  if (params.get("type") !== "recovery") return null;
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  return { kind: "tokens", accessToken, refreshToken };
}

/** Where to send a recovery hash that landed on another page, or null to stay. */
export function recoveryRedirectTarget(pathname: string, hash: string): string | null {
  if (pathname === RESET_PASSWORD_PATH) return null;
  const parsed = parseRecoveryHash(hash);
  if (parsed?.kind !== "tokens") return null;
  return RESET_PASSWORD_PATH + hash;
}
