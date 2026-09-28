/**
 * Allow only same-origin relative paths for post-auth redirects.
 *
 * Browsers strip tabs and newlines from URLs and treat backslashes like
 * forward slashes, so `/\tevil.com` or `/\\evil.com` can turn into
 * `//evil.com` (another website). To be safe we:
 *   1. decode once so percent-encoded tricks are checked too,
 *   2. reject any control or whitespace character and any backslash,
 *   3. require a single leading slash (no protocol-relative `//`),
 *   4. resolve against a fixed origin with `new URL()` and confirm the
 *      final origin did not change.
 */

/** Stand-in origin used only to check where a path would resolve. */
const CHECK_ORIGIN = "https://same-origin.invalid";

/**
 * C0 and C1 control characters, every Unicode whitespace character, and the
 * zero-width / BOM characters some browsers also ignore.
 */
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\s​-‍⁠﻿]/u;

function hasUnsafeChars(value: string): boolean {
  return UNSAFE_CHARS.test(value) || value.includes("\\");
}

export function safeRelativePath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  if (hasUnsafeChars(value) || hasUnsafeChars(decoded)) return fallback;
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
  if (decoded.includes("://")) return fallback;

  let resolved: URL;
  try {
    resolved = new URL(decoded, CHECK_ORIGIN);
  } catch {
    return fallback;
  }
  if (resolved.origin !== CHECK_ORIGIN) return fallback;

  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  // Belt and braces: the normalized path must still be a single-slash path.
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}
