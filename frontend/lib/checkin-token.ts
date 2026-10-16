import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proof of presence for visit check-ins.
 *
 * The printed in-store QR code carries `?t=<token>`, where the token is an
 * HMAC-SHA256 of the brand slug keyed with CHECKIN_SIGNING_SECRET. That
 * static token stays valid so posters already on the wall keep working.
 *
 * A brand can also require a rotating token (`r1.` plus an HMAC of the slug
 * and a time bucket). The host-stand screen shows that code. It uses the
 * same signing secret. Do not change the secret: every printed poster
 * would stop working.
 *
 * Server only: this module uses node:crypto.
 */

/** Query parameter that carries the token on the check-in URL. */
export const CHECKIN_TOKEN_PARAM = "t";

/** Shown when the token is missing or wrong. */
export const CHECKIN_TOKEN_REQUIRED_MESSAGE =
  "Scan the QR code in the store to check in.";

/**
 * Shown when the printed poster is still a valid sign-up link but this
 * brand only awards visit points from the rotating host-stand code.
 */
export const HOST_STAND_REQUIRED_MESSAGE =
  "You're signed up. To earn today's visit points, scan the code at the host stand.";

/** Prefix that marks a rotating token. Static tokens never contain a dot. */
export const ROTATING_CHECKIN_PREFIX = "r1.";

const DEFAULT_CHECKIN_WINDOW_SECONDS = 600;
const MIN_CHECKIN_WINDOW_SECONDS = 60;
const MAX_CHECKIN_WINDOW_SECONDS = 86_400;

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

/** Constant-time string compare. Length mismatches return false. */
function tokensEqual(expected: string, given: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(given, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Constant-time check that `token` was signed for `brandSlug`. */
export function verifyCheckinToken(
  brandSlug: string,
  token: string | null | undefined,
  secret: string,
): boolean {
  if (!token || typeof token !== "string") return false;
  return tokensEqual(signCheckinToken(brandSlug, secret), token.trim());
}

/** Rotating window in seconds. Default 10 minutes, clamped to 1 minute..1 day. */
export function checkinWindowSeconds(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.CHECKIN_ROTATING_WINDOW_SECONDS?.trim();
  if (!raw) return DEFAULT_CHECKIN_WINDOW_SECONDS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_CHECKIN_WINDOW_SECONDS;
  return Math.min(
    MAX_CHECKIN_WINDOW_SECONDS,
    Math.max(MIN_CHECKIN_WINDOW_SECONDS, Math.floor(parsed)),
  );
}

/** Unix-second bucket for a rotating check-in token. */
export function checkinBucket(nowMs: number, windowSeconds: number): number {
  return Math.floor(nowMs / 1000 / windowSeconds);
}

/** Milliseconds until the current bucket ends. At least one second. */
export function rotatingRefreshInMs(nowMs: number, windowSeconds: number): number {
  const windowMs = windowSeconds * 1000;
  const remaining = windowMs - (nowMs % windowMs);
  return Math.max(1000, remaining);
}

/** HMAC of slug + bucket, prefixed so it cannot be confused with a poster token. */
export function signRotatingCheckinToken(
  brandSlug: string,
  secret: string,
  bucket: number,
): string {
  const mac = createHmac("sha256", secret)
    .update(`checkin:${normalizeSlug(brandSlug)}:${bucket}`)
    .digest("base64url");
  return `${ROTATING_CHECKIN_PREFIX}${mac}`;
}

/**
 * Current bucket, previous bucket, or null.
 * Both candidates are compared so a match on the first does not return early.
 */
export function verifyRotatingCheckinToken(
  brandSlug: string,
  token: string | null | undefined,
  secret: string,
  nowMs: number,
  windowSeconds: number,
): "current" | "previous" | null {
  if (!token || typeof token !== "string") return null;
  const given = token.trim();
  if (!given.startsWith(ROTATING_CHECKIN_PREFIX)) return null;
  const bucket = checkinBucket(nowMs, windowSeconds);
  const current = signRotatingCheckinToken(brandSlug, secret, bucket);
  const previous = signRotatingCheckinToken(brandSlug, secret, bucket - 1);
  const currentOk = tokensEqual(current, given);
  const previousOk = tokensEqual(previous, given);
  if (currentOk) return "current";
  if (previousOk) return "previous";
  return null;
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

export type CheckinAccessDecision =
  | {
      allow: true;
      awardPoints: true;
      reason: "valid" | "unconfigured" | "rotating" | "rotating_previous";
    }
  | { allow: true; awardPoints: false; reason: "static_signup_only" }
  | { allow: false; awardPoints: false; reason: "missing" | "invalid" | "expired" };

/**
 * Whether this scan may open check-in, and whether it may award points.
 *
 * `requireRotating` false is today's behavior: the static poster token
 * awards points, and a rotating token is just an invalid token.
 * When the flag is true, the poster token still verifies (sign-up stays
 * open) but does not award points. Points need the current or previous
 * rotating bucket. With no signing secret, check-ins stay allowed either
 * way so a deploy cannot turn visits off.
 */
export function checkinAccessDecision(
  brandSlug: string,
  token: string | null | undefined,
  secret: string | null,
  requireRotating: boolean,
  nowMs: number = Date.now(),
  windowSeconds: number = checkinWindowSeconds(),
): CheckinAccessDecision {
  if (!secret) return { allow: true, awardPoints: true, reason: "unconfigured" };

  if (!requireRotating) {
    const decision = checkinTokenDecision(brandSlug, token, secret);
    if (!decision.allow) {
      return { allow: false, awardPoints: false, reason: decision.reason };
    }
    return { allow: true, awardPoints: true, reason: decision.reason };
  }

  if (!token) return { allow: false, awardPoints: false, reason: "missing" };

  const rotating = verifyRotatingCheckinToken(
    brandSlug,
    token,
    secret,
    nowMs,
    windowSeconds,
  );
  if (rotating === "current") {
    return { allow: true, awardPoints: true, reason: "rotating" };
  }
  if (rotating === "previous") {
    return { allow: true, awardPoints: true, reason: "rotating_previous" };
  }
  if (token.trim().startsWith(ROTATING_CHECKIN_PREFIX)) {
    return { allow: false, awardPoints: false, reason: "expired" };
  }
  if (verifyCheckinToken(brandSlug, token, secret)) {
    return { allow: true, awardPoints: false, reason: "static_signup_only" };
  }
  return { allow: false, awardPoints: false, reason: "invalid" };
}

/** Relative check-in path, with the token when one is given. */
export function checkinPath(brandSlug: string, token?: string | null): string {
  const base = `/brands/${encodeURIComponent(brandSlug)}/checkin`;
  return token
    ? `${base}?${CHECKIN_TOKEN_PARAM}=${encodeURIComponent(token)}`
    : base;
}
