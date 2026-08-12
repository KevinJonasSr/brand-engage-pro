/**
 * Shared cookie-consent helpers for the banner and non-essential cookie writers.
 *
 * Choice is stored in localStorage (not a cookie) so the banner can gate
 * non-essential cookies such as referral attribution (`memberengage_ref`).
 * Auth/session cookies are essential and are not gated here.
 */

export const COOKIE_CONSENT_STORAGE_KEY = "memberengage_cookie_consent";

export type CookieConsentChoice = "accept" | "decline";

export type CookieConsentRecord = {
  choice: CookieConsentChoice;
  at: string;
};

function parseRecord(raw: string | null): CookieConsentRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { choice?: unknown; at?: unknown };
    if (parsed.choice !== "accept" && parsed.choice !== "decline") return null;
    return {
      choice: parsed.choice,
      at: typeof parsed.at === "string" ? parsed.at : "",
    };
  } catch {
    return null;
  }
}

/** Read consent from localStorage. Returns null if unset or unreadable. */
export function getCookieConsent(): CookieConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    return parseRecord(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Persist an accept/decline choice. */
export function setCookieConsent(choice: CookieConsentChoice): void {
  if (typeof window === "undefined") return;
  try {
    const record: CookieConsentRecord = {
      choice,
      at: new Date().toISOString(),
    };
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Non-essential cookies (e.g. referral attribution) may only be set after
 * an explicit Accept. Decline and "no choice yet" both block them.
 */
export function allowsNonEssentialCookies(): boolean {
  return getCookieConsent()?.choice === "accept";
}
