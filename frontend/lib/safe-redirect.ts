/**
 * Allow only same-origin relative paths for post-auth redirects.
 * Rejects absolute URLs, protocol-relative URLs (`//evil.com`), and
 * backslash variants some browsers normalize into protocol-relative form.
 */
export function safeRelativePath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value) return fallback;

  // Decode once so `%2F%2Fevil.com` / encoded backslashes cannot bypass checks.
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  if (!decoded.startsWith("/")) return fallback;
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return fallback;
  if (decoded.includes("://") || decoded.includes("\\")) return fallback;

  return decoded;
}
