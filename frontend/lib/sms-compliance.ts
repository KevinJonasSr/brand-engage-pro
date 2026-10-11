/**
 * Texting compliance (item 11). Pure functions only, so they can be unit
 * tested and shared by the Twilio inbound webhook, the broadcast sender and
 * the notification dispatcher.
 *
 * Covers the carrier (10DLC) and TCPA basics:
 *   - STOP / HELP / START keywords and their replies
 *   - the consent wording shown at sign-up
 *   - a STOP footer on every outgoing text
 *   - no marketing texts between 9pm and 8am in the member's own time zone
 */

export const BRAND_NAME = "Brand Engage Pro";
export const SUPPORT_EMAIL = "support@brandengagepro.com";

export const STOP_KEYWORDS: ReadonlySet<string> = new Set([
  "STOP", "STOPALL", "UNSUB", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT",
]);
export const HELP_KEYWORDS: ReadonlySet<string> = new Set(["HELP", "INFO"]);
export const START_KEYWORDS: ReadonlySet<string> = new Set(["START", "YES", "UNSTOP"]);

export type SmsKeyword = "stop" | "start" | "help";

export const STOP_REPLY =
  `You're unsubscribed from ${BRAND_NAME} texts and will get no more messages. ` +
  "Reply START to opt back in. Reply HELP for help.";

export const START_REPLY =
  `You're back in for ${BRAND_NAME} texts about rewards, specials, and events. ` +
  "Msg frequency varies. Msg & data rates may apply. Reply HELP for help. Reply STOP to opt out.";

/** START from a number that never gave consent on the site. */
export const START_NO_CONSENT_REPLY =
  `To get ${BRAND_NAME} texts, sign up at brandengagepro.com and tick the text box. ` +
  "Reply HELP for help.";

export const HELP_REPLY =
  `${BRAND_NAME}: texts about rewards, specials, and events from the places you join. ` +
  `Msg frequency varies. Msg & data rates may apply. Help: ${SUPPORT_EMAIL}. Reply STOP to opt out.`;

/** Shown next to the SMS consent box at sign-up. */
export const SMS_CONSENT_TEXT =
  "Text me about rewards, specials, and events from the places I join. " +
  "Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out. " +
  "Consent is not a condition of purchase.";

export const STOP_FOOTER = " Reply STOP to opt out.";

/** Carriers and the TCPA expect no marketing texts from 9pm to 8am local. */
export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 8;
export const DEFAULT_SMS_TIMEZONE = "America/Chicago";

/**
 * Read the first word of an inbound text as a keyword. Case and stray
 * punctuation ("Stop." or "stop!") are ignored.
 */
export function parseSmsKeyword(body: string | null | undefined): SmsKeyword | null {
  const first = (body ?? "").trim().split(/\s+/)[0] ?? "";
  const word = first.toUpperCase().replace(/[^A-Z]/g, "");
  if (!word) return null;
  if (STOP_KEYWORDS.has(word)) return "stop";
  if (START_KEYWORDS.has(word)) return "start";
  if (HELP_KEYWORDS.has(word)) return "help";
  return null;
}

/** Add the STOP footer unless the message already tells people how to stop. */
export function withStopFooter(body: string): string {
  return /\bSTOP\b/i.test(body) ? body : body + STOP_FOOTER;
}

/**
 * The ways a sender's number might be stored on members.phone. Phones are
 * meant to be E.164, but older rows can hold bare digits, so look up all
 * forms. Returns an empty list for a number with no digits.
 */
export function phoneLookupVariants(from: string | null | undefined): string[] {
  const digits = (from ?? "").replace(/\D/g, "");
  if (!digits) return [];
  const variants = new Set<string>([`+${digits}`, digits]);
  // US numbers: also match a stored 10-digit number without the country code.
  if (digits.length === 11 && digits.startsWith("1")) {
    const national = digits.slice(1);
    variants.add(national);
    variants.add(`+1${national}`);
  }
  if (digits.length === 10) {
    variants.add(`1${digits}`);
    variants.add(`+1${digits}`);
  }
  return [...variants];
}

/** Local hour (0-23) in a time zone, or null when the zone is not valid. */
function localHour(timezone: string, now: Date): number | null {
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now);
    const n = Number.parseInt(hour, 10);
    return Number.isFinite(n) ? n % 24 : null;
  } catch {
    return null;
  }
}

/**
 * True between 9pm and 8am in the member's time zone. A missing or bad time
 * zone falls back to America/Chicago.
 */
export function isSmsQuietTime(timezone: string | null | undefined, now: Date = new Date()): boolean {
  const hour =
    (timezone ? localHour(timezone, now) : null) ?? localHour(DEFAULT_SMS_TIMEZONE, now) ?? 12;
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}
