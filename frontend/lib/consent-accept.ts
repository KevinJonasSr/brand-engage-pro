export const CONSENT_SCROLL_THRESHOLD_PX = 24;

export type ScrollBox = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

/**
 * True when the box is already at the end — including the no-overflow case
 * (scrollHeight <= clientHeight), where onScroll never fires.
 */
export function isScrollAtBottom(
  el: ScrollBox,
  thresholdPx = CONSENT_SCROLL_THRESHOLD_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < thresholdPx;
}

/**
 * Accept is allowed once every consent doc has been seen at its end,
 * or the member explicitly checks the acknowledgment box.
 */
export function canAcceptConsent({
  docCount,
  scrolledEnd,
  acknowledged,
}: {
  docCount: number;
  scrolledEnd: Record<number, boolean>;
  acknowledged: boolean;
}): boolean {
  if (acknowledged) return true;
  if (docCount <= 0) return true;
  for (let i = 0; i < docCount; i++) {
    if (!scrolledEnd[i]) return false;
  }
  return true;
}

/** Dash-locked /signup consent copy. Keep these strings exact. */
export const CONSENT_COPY = {
  keepScrollingCue: "Keep scrolling, or check the box below to accept.",
  lockedAccept: "Keep scrolling or check the box",
  unlockedAccept: "I agree — create my account",
  checkboxLabel: "I have read the Terms and Privacy Policy.",
  failOpen: "You can still create an account.",
} as const;

export const NELLIES_CONSENT_DISPLAY_NAME = "Nellie's";

export function reviewedConsentCount(
  docCount: number,
  scrolledEnd: Record<number, boolean>,
): number {
  let n = 0;
  for (let i = 0; i < docCount; i++) {
    if (scrolledEnd[i]) n++;
  }
  return n;
}

export function consentProgressLabel(reviewed: number, docCount: number): string {
  return `${reviewed} of ${docCount} reviewed`;
}

/** Sticky / button-adjacent cue while this doc is unfinished and the box is off. */
export function shouldShowKeepScrollingCue(opts: {
  currentDocReviewed: boolean;
  acknowledged: boolean;
}): boolean {
  return !opts.acknowledged && !opts.currentDocReviewed;
}

export function consentAcceptLabel(canAccept: boolean): string {
  return canAccept ? CONSENT_COPY.unlockedAccept : CONSENT_COPY.lockedAccept;
}

/**
 * Review-step title. Nellie's Join CTA must name Nellie's even when the
 * resolved brand record is the longer "Nellie's Southern Kitchen".
 */
export function consentReviewTitle(opts: {
  brandSlug?: string | null;
  brandName?: string | null;
}): string {
  const slug = opts.brandSlug?.trim().toLowerCase();
  // Keep in lockstep with NELLIES_BRAND_SLUG in nellies-launch.ts.
  if (slug === "nellies") {
    return `Review before you join ${NELLIES_CONSENT_DISPLAY_NAME}`;
  }
  const name = opts.brandName?.trim();
  if (name) return `Review before you join ${name}`;
  return "Review before you join";
}
