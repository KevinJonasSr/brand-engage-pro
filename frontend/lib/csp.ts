/**
 * Site-wide Content-Security-Policy.
 *
 * Turnstile on www.brandengagepro.com/signup needs Cloudflare's script,
 * iframe, worker, and connect endpoints. A missing worker-src/blob or
 * child-src fallback is a common "Security check couldn't load" cause
 * even when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
 *
 * Official minimum: script-src + frame-src https://challenges.cloudflare.com
 * https://developers.cloudflare.com/turnstile/reference/content-security-policy/
 */
export const TURNSTILE_CSP_HOST = "https://challenges.cloudflare.com";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: ${TURNSTILE_CSP_HOST}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  `frame-src ${TURNSTILE_CSP_HOST}`,
  `child-src ${TURNSTILE_CSP_HOST}`,
  `worker-src 'self' blob: ${TURNSTILE_CSP_HOST}`,
  "frame-ancestors 'none'",
].join("; ");
