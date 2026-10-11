/**
 * Keep new members on the onboarding path while remembering where they
 * were headed (for example a QR check-in page).
 *
 * Every new sign-up goes through /onboarding first (welcome bonus, home
 * brand auto-join, SMS consent). `next` rides along on the onboarding URL
 * and onboarding sends the member there when it finishes.
 *
 * Callers sanitize `next` with safeRelativePath() first. These helpers
 * re-check the basic shape as a second guard: a single leading slash, no
 * protocol-relative `//`, no backslash.
 */

/** Paths that must never be the post-onboarding target (loops). */
const LOOP_PREFIXES = ["/onboarding", "/signup", "/login"];

function isRelativeSameSite(value: string): boolean {
  return (
    value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
  );
}

function isLoopPath(value: string): boolean {
  const path = value.split(/[?#]/, 1)[0] ?? "";
  return LOOP_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** A usable post-onboarding target, or null when there is none. */
export function onboardingNextTarget(
  next: string | null | undefined,
): string | null {
  if (!next || !isRelativeSameSite(next) || isLoopPath(next)) return null;
  return next;
}

/** /onboarding URL that carries `ref` attribution and the `next` target. */
export function buildOnboardingHref(
  ref: string | null | undefined,
  next: string | null | undefined,
): string {
  const params = new URLSearchParams();
  if (ref) params.set("ref", ref);
  const target = onboardingNextTarget(next);
  if (target) params.set("next", target);
  const query = params.toString();
  return query ? `/onboarding?${query}` : "/onboarding";
}

/** Where to go when onboarding is done (or was already done). */
export function onboardingDoneHref(next: string | null | undefined): string {
  return onboardingNextTarget(next) ?? "/";
}
