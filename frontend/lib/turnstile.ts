/**
 * Turnstile configuration helpers.
 *
 * Soft-launch rule: production must never silently skip captcha when keys are
 * missing. Local `next dev` may proceed without keys. Shared/preview envs can
 * set TURNSTILE_ALLOW_BYPASS=1 only when VERCEL_ENV is not "production".
 */

/** True for the live production deployment (or local `next start` without Vercel). */
export function isProductionRuntime(): boolean {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === "production";
  }
  return process.env.NODE_ENV === "production";
}

/**
 * Explicit opt-out for environments that intentionally run without Turnstile.
 * Ignored when VERCEL_ENV=production so a mis-set preview flag cannot leak
 * into the soft-launch host.
 */
export function isTurnstileBypassAllowed(): boolean {
  if (process.env.TURNSTILE_ALLOW_BYPASS !== "1") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  return true;
}
