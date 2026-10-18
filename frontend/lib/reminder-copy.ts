import {
  EMAIL_BODY_MAX,
  EMAIL_SUBJECT_MAX,
  marketingEmailBlockReason,
  oneLine,
  parseEmailAllowlist,
  validateEmailCampaign,
} from "./email-campaign.ts";

export type ReminderCopyKind = "reminder_24h" | "reminder_1h" | "manual";

export type ReminderCopyInput = {
  title: string;
  detail: string | null;
  starts_at: string;
  location: string | null;
  url: string | null;
  brand_name: string | null;
};

/** Shown on a reminder row when scheduled email waited for the allowlist. */
export const EMAIL_ALLOWLIST_HOLD = "held back by BEP_EMAIL_ALLOWLIST";

const RETRYABLE_EMAIL_ERRORS = [
  "EMAIL_SENDING_ENABLED",
  "Email sending is off",
  "BEP_MAILING_ADDRESS",
  "BEP_EMAIL_ALLOWLIST",
  "BEP_EMAIL_FROM",
  "MAILCHIMP_TRANSACTIONAL_API_KEY",
  "Email sending not configured",
];

/** Clock time in Eastern, matching the rest of Brand Engage Pro. */
export function formatReminderClock(
  startsAt: string,
  timeZone = "America/New_York",
): string {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(date);
}

function clampLine(value: string, max: number): string {
  const clean = oneLine(value);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function clampBody(value: string, max: number): string {
  const clean = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Default reminder subject and body. Always short enough to pass the
 * campaign validator, and the email names the clock time.
 * SMS copy is unchanged so a long title does not grow the text.
 */
export function buildDefaultReminderCopy(
  event: ReminderCopyInput,
  kind: ReminderCopyKind,
): { subject: string; sms: string; email: string } {
  const when =
    kind === "reminder_24h" ? "tomorrow" : kind === "reminder_1h" ? "in 1 hour" : "soon";
  const brandName = oneLine(event.brand_name ?? "") || "Your brand";
  const title = oneLine(event.title) || "your event";
  const locBit = event.location ? ` at ${oneLine(event.location)}` : "";
  const linkBit = event.url ? ` Link: ${oneLine(event.url)}` : "";
  const clock = formatReminderClock(event.starts_at);
  const whenBit = clock ? `${when} (${clock})` : when;
  const sms = `${brandName}'s ${title} starts ${when}${locBit}.${linkBit} See you there!`;
  const subject = clampLine(`Reminder: ${title} starts ${when}`, EMAIL_SUBJECT_MAX);
  const detail = event.detail ? `${event.detail.trim()}\n\n` : "";
  const urlLine = event.url ? `Details: ${event.url.trim()}\n\n` : "";
  const email = clampBody(
    `Hey — quick heads up: ${brandName}'s ${title} starts ${whenBit}${locBit}.\n\n` +
      detail +
      urlLine +
      `Thanks for RSVPing.`,
    EMAIL_BODY_MAX,
  );
  return { subject, sms, email };
}

/** Scheduled email may go to the real audience only when the gate is open and no allowlist is set. */
export function scheduledEmailGateOpen(env: Record<string, string | undefined> = process.env): boolean {
  if (marketingEmailBlockReason(env)) return false;
  const allow = parseEmailAllowlist(env);
  return allow.ok && allow.emails === null;
}

/**
 * A scheduled reminder row that recorded an email block and delivered
 * nothing can be emailed later, while the event is still in the window.
 * A Mandrill failure is not retried here (the request may have landed).
 */
export function reminderNeedsEmailRetry(row: {
  error: string | null;
  recipients_email: number;
} | null): boolean {
  if (!row || row.recipients_email > 0) return false;
  const error = row.error ?? "";
  if (!error.includes("email:")) return false;
  return RETRYABLE_EMAIL_ERRORS.some((token) => error.includes(token));
}

/** Guard so generated reminder copy cannot be rejected by the send validator. */
export function reminderCopyIsSendable(copy: { subject: string; email: string }): boolean {
  return validateEmailCampaign({ subject: copy.subject, body: copy.email }) === null;
}
