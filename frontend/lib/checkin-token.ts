import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proof of presence for visit check-ins.
 *
 * The in-store QR code carries `?t=<token>`, where the token is an
 * HMAC-SHA256 keyed with CHECKIN_SIGNING_SECRET. Only the server (and the
 * admin QR page) can make a valid token, so a member has to scan the code in
 * the store instead of POSTing a slug from home.
 *
 * Rotation (Sprint 3): the signed message is `checkin:${slug}:${bucket}`
 * where bucket = floor(unixSeconds / ROTATION_SECONDS). A token therefore
 * changes every 15 minutes, so one photo of the QR no longer earns points
 * from home every day. Verification accepts the current bucket and the one
 * before it, so a code scanned right at a boundary still works.
 *
 * Legacy escape hatch: when the env var CHECKIN_TOKEN_ROTATION is exactly
 * "off", signing and verification fall back to the old static scheme
 * (`checkin:${slug}`, no bucket). A brand that has already printed its QR
 * keeps working the moment this deploys; flip rotation on once the live QR
 * (admin page) is on display. Any other value, or no value, means rotation
 * is on.
 *
 * Server only: this module uses node:crypto.
 */

/** Query parameter that carries the token on the check-in URL. */
export const CHECKIN_TOKEN_PARAM = "t";

/** How long one token stays current (seconds). 15 minutes. */
export const ROTATION_SECONDS = 900;

/**
 * How far back (in buckets) a stale token is still recognised as "expired"
 * rather than "invalid" — 24 hours. Older than that, or never valid, and the
 * member just gets the generic "scan the QR" message.
 */
export const EXPIRED_LOOKBACK_BUCKETS = (24 * 60 * 60) / ROTATION_SECONDS;

/** Shown when the token is missing or wrong. */
export const CHECKIN_TOKEN_REQUIRED_MESSAGE =
  "Scan the QR code in the store to check in.";

/** Machine-readable error code for a token that was valid but has rotated out. */
export const CHECKIN_TOKEN_EXPIRED_CODE = "expired_code";

/** Shown when the token has rotated out. */
export const CHECKIN_TOKEN_EXPIRED_MESSAGE =
  "This code has expired — ask for the live QR at the counter";

type Env = Record<string, string | undefined>;

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/** Read the signing secret. Blank or missing means "not configured". */
export function checkinSecretFromEnv(env: Env = process.env): string | null {
  const value = env.CHECKIN_SIGNING_SECRET?.trim();
  return value ? value : null;
}

/**
 * True unless CHECKIN_TOKEN_ROTATION is exactly "off" (case-insensitive,
 * trimmed). See the module comment for why the escape hatch exists.
 */
export function checkinRotationEnabled(env: Env = process.env): boolean {
  return (env.CHECKIN_TOKEN_ROTATION ?? "").trim().toLowerCase() !== "off";
}

/** Rotation bucket for a point in time (ms since epoch). */
export function checkinTokenBucket(now: number = Date.now()): number {
  return Math.floor(now / 1000 / ROTATION_SECONDS);
}

/**
 * When the token minted at `now` stops being the *current* one (ms since
 * epoch) — i.e. when the admin QR should refresh. Verification keeps
 * accepting it for one more bucket after this (the grace window).
 */
export function checkinTokenExpiresAt(now: number = Date.now()): number {
  return (checkinTokenBucket(now) + 1) * ROTATION_SECONDS * 1000;
}

function hmac(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("base64url");
}

function signLegacy(brandSlug: string, secret: string): string {
  return hmac(`checkin:${normalizeSlug(brandSlug)}`, secret);
}

function signBucket(brandSlug: string, secret: string, bucket: number): string {
  return hmac(`checkin:${normalizeSlug(brandSlug)}:${bucket}`, secret);
}

/**
 * Sign a check-in token for `brandSlug`, base64url encoded.
 *
 * Rotating (default): HMAC-SHA256 over `checkin:${slug}:${bucket}` for the
 * bucket that contains `now`. Legacy (CHECKIN_TOKEN_ROTATION="off"): the
 * static `checkin:${slug}` scheme, ignoring `now`.
 */
export function signCheckinToken(
  brandSlug: string,
  secret: string,
  now: number = Date.now(),
  env: Env = process.env,
): string {
  if (!checkinRotationEnabled(env)) return signLegacy(brandSlug, secret);
  return signBucket(brandSlug, secret, checkinTokenBucket(now));
}

/** Constant-time equality of two base64url strings. */
function tokenEquals(given: string, expected: string): boolean {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Constant-time check that `token` was signed for `brandSlug`.
 *
 * Rotating (default): accepts the token for the bucket containing `now`
 * and for the bucket before it (grace window for scans near a boundary).
 * Two or more buckets back is rejected. Legacy (CHECKIN_TOKEN_ROTATION="off"):
 * accepts only the static token.
 */
export function verifyCheckinToken(
  brandSlug: string,
  token: string | null | undefined,
  secret: string,
  now: number = Date.now(),
  env: Env = process.env,
): boolean {
  if (!token || typeof token !== "string") return false;
  const given = token.trim();
  if (!checkinRotationEnabled(env)) {
    return tokenEquals(given, signLegacy(brandSlug, secret));
  }
  const bucket = checkinTokenBucket(now);
  // Evaluate both so timing does not reveal which bucket matched.
  const current = tokenEquals(given, signBucket(brandSlug, secret, bucket));
  const previous = tokenEquals(given, signBucket(brandSlug, secret, bucket - 1));
  return current || previous;
}

/**
 * True when `token` was a real token for `brandSlug` that has since rotated
 * out (older than the grace window, within EXPIRED_LOOKBACK_BUCKETS). Lets
 * the API tell "come back to the counter" apart from "never valid". Always
 * false in legacy mode, where nothing expires.
 */
export function isExpiredCheckinToken(
  brandSlug: string,
  token: string | null | undefined,
  secret: string,
  now: number = Date.now(),
  env: Env = process.env,
): boolean {
  if (!token || typeof token !== "string") return false;
  if (!checkinRotationEnabled(env)) return false;
  const given = token.trim();
  const bucket = checkinTokenBucket(now);
  for (let back = 2; back <= EXPIRED_LOOKBACK_BUCKETS; back++) {
    if (tokenEquals(given, signBucket(brandSlug, secret, bucket - back))) {
      return true;
    }
  }
  return false;
}

export type CheckinTokenDecision =
  | { allow: true; reason: "valid" | "unconfigured" }
  | { allow: false; reason: "missing" | "invalid" | "expired" };

/**
 * Decide whether a check-in may proceed.
 *
 * Rollout safety: with no secret configured every check-in is allowed
 * (reason "unconfigured") so the deploy cannot break check-ins before the
 * env var is added. Once the secret is set, the token is required.
 *
 * "expired" means the token was genuine but has rotated out; "invalid"
 * means it never matched this brand (or any recent bucket).
 */
export function checkinTokenDecision(
  brandSlug: string,
  token: string | null | undefined,
  secret: string | null,
  now: number = Date.now(),
  env: Env = process.env,
): CheckinTokenDecision {
  if (!secret) return { allow: true, reason: "unconfigured" };
  if (!token) return { allow: false, reason: "missing" };
  if (verifyCheckinToken(brandSlug, token, secret, now, env)) {
    return { allow: true, reason: "valid" };
  }
  if (isExpiredCheckinToken(brandSlug, token, secret, now, env)) {
    return { allow: false, reason: "expired" };
  }
  return { allow: false, reason: "invalid" };
}

/** Relative check-in path, with the token when one is given. */
export function checkinPath(brandSlug: string, token?: string | null): string {
  const base = `/brands/${encodeURIComponent(brandSlug)}/checkin`;
  return token
    ? `${base}?${CHECKIN_TOKEN_PARAM}=${encodeURIComponent(token)}`
    : base;
}
