/**
 * Motion preferences. CSS `scroll-behavior` does not reach scripted
 * scrolls, so any `scrollTo` / `scrollIntoView` with a smooth behavior
 * should ask here first. Safe on the server and in old browsers: both
 * fall back to the normal (smooth) behavior.
 */

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  try {
    const w = (globalThis as { window?: { matchMedia?: (q: string) => { matches: boolean } } }).window;
    if (!w || typeof w.matchMedia !== "function") return false;
    return w.matchMedia(REDUCE_QUERY).matches;
  } catch {
    return false;
  }
}

/** "auto" (instant jump) when the device asks for less motion, else "smooth". */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

/** Front Porch Supper stagger: 120ms per item, capped so a long list never waits. */
export const REVEAL_STAGGER_MS = 120;
export const REVEAL_MAX_STEPS = 4;

export function revealDelayMs(index: number): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  return Math.min(Math.floor(index), REVEAL_MAX_STEPS) * REVEAL_STAGGER_MS;
}
