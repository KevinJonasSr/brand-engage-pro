/**
 * Cloudflare outage fail-open is opt-in only.
 * A failClosed request (password / signup / magic-link when used) and
 * production never fail open on upstream/network errors.
 */
export function turnstileUpstreamFailOpen(opts: {
  failOpenEnv?: string;
  failClosedRequest?: boolean;
  vercelEnv?: string;
}): boolean {
  if (opts.failClosedRequest) return false;
  if (opts.vercelEnv === "production") return false;
  const v = opts.failOpenEnv;
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}
