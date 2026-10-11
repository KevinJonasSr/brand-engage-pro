import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proof of presence for visit check-ins.
 *
 * The printed in-store QR code carries `?t=<token>`, where the token is an
 * HMAC-SHA256 of the brand slug keyed with CHECKIN_SIGNING_SECRET. Only the
 * server (and the admin QR page) can make a valid token, so a member has to
 * scan the code in the store instead of POSTing a slug from home.
 *
 * Server only: this module uses node:crypto.
 */

/** Query parameter that carries the token on the check-in URL. */
export const CHECKIN_TOKEN_PARAM = "t";

/** Shown when the token is missing or wrong. */
export const CHECKIN_TOKEN_REQUIRED_MESSAGE =
  "Scan the QR code in the store to check in.";

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/** Read the signing secret. Blank or missing means "not configured". */
export function checkinSecretFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const value = env.CHECKIN_SIGNING_SECRET?.trim();
  return value ? value : null;
}

/** HMAC-SHA256 of the brand slug, base64url encoded. */
export function signCheckinToken(brandSlug: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`checkin:${normalizeSlug(brandSlug)}`)
    .digest("base64url");
}

/** Constant-time check that `token` was signed for `brandSlug`. */
export function verifyCheckinToken(
  brandSlug: string,
  token: string | null | undefined,
  secret: string,
): boolean {
  if (!token || typeof token !== "string") return false;
  const expected = Buffer.from(signCheckinToken(brandSlug, secret), "utf8");
  const given = Buffer.from(token.trim(), "utf8");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

export type CheckinTokenDecision =
  | { allow: true; reason: "valid" | "unconfigured" }
  | { allow: false; reason: "missing" | "invalid" };

/**
 * Decide whether a check-in may proceed.
 *
 * Rollout safety: with no secret configured every check-in is allowed
 * (reason "unconfigured") so the deploy cannot break check-ins before the
 * env var is added. Once the secret is set, the token is required.
 */
export function checkinTokenDecision(
  brandSlug: string,
  token: string | null | undefined,
  secret: string | null,
): CheckinTokenDecision {
  if (!secret) return { allow: true, reason: "unconfigured" };
  if (!token) return { allow: false, reason: "missing" };
  return verifyCheckinToken(brandSlug, token, secret)
    ? { allow: true, reason: "valid" }
    : { allow: false, reason: "invalid" };
}

/** Relative check-in path, with the token when one is given. */
export function checkinPath(brandSlug: string, token?: string | null): string {
  const base = `/brands/${encodeURIComponent(brandSlug)}/checkin`;
  return token
    ? `${base}?${CHECKIN_TOKEN_PARAM}=${encodeURIComponent(token)}`
    : base;
}
