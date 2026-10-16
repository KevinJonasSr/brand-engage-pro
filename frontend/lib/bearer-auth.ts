import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of an `Authorization: Bearer <secret>` header.
 * Returns false when the expected secret is missing, so a route can
 * answer 401 instead of running with no secret configured.
 */
export function bearerSecretMatches(
  authorization: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorization ?? "");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
