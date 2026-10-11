/**
 * Brand-scoped email campaigns (item 10). Pure functions only, so they can
 * be unit tested and shared by the campaign builder, the broadcast page and
 * event reminders.
 *
 * Email goes out one message per member through Mailchimp Transactional
 * (Mandrill), so every send is limited to the members of one brand who opted
 * in to email. Each member gets their own unsubscribe link.
 *
 * The send itself lives in lib/broadcast.ts (broadcastBrandEmail).
 */

export const EMAIL_SUBJECT_MAX = 150;
export const EMAIL_BODY_MAX = 10000;
/** Recipients per Mandrill API call. */
export const MANDRILL_BATCH_SIZE = 100;
/** Merge tag Mandrill swaps for each member's own unsubscribe link. */
export const UNSUB_MERGE_TAG = "*|UNSUB_URL|*";
/** Merge tag for the RFC 8058 one-click unsubscribe URL. */
export const ONECLICK_MERGE_TAG = "*|UNSUB_ONECLICK|*";
const DEFAULT_APP_URL = "https://www.brandengagepro.com";

type EnvLike = Record<string, string | undefined>;

/**
 * Marketing email stays off until this is exactly "1".
 * Setting MAILCHIMP_TRANSACTIONAL_API_KEY alone does not send.
 * MAILCHIMP_BROADCAST_ENABLED is not read.
 */
export function isMarketingEmailEnabled(env: EnvLike = process.env): boolean {
  return env.EMAIL_SENDING_ENABLED === "1";
}

/** Physical mailing address for marketing footers. Blank means unset. */
export function mailingAddress(env: EnvLike = process.env): string | null {
  const value = env.BEP_MAILING_ADDRESS?.trim().replace(/\s+/g, " ") ?? "";
  return value.length > 0 ? value : null;
}

export function appBaseUrl(env: EnvLike = process.env): string {
  const raw = env.NEXT_PUBLIC_APP_URL?.trim() || DEFAULT_APP_URL;
  return raw.replace(/\/+$/, "");
}

/**
 * Why a marketing send must not go out, or null when it may.
 * The Mandrill key, the off switch, and the mailing address are all required.
 */
export function marketingEmailBlockReason(env: EnvLike = process.env): string | null {
  if (!isMarketingEmailEnabled(env)) {
    return "Email sending is off. Set EMAIL_SENDING_ENABLED=1 to send. The Mandrill key alone does not send.";
  }
  if (!mailingAddress(env)) {
    return "Set BEP_MAILING_ADDRESS to your physical mailing address before sending marketing email.";
  }
  if (!env.MAILCHIMP_TRANSACTIONAL_API_KEY?.trim()) {
    return "Email sending not configured (MAILCHIMP_TRANSACTIONAL_API_KEY missing)";
  }
  return null;
}

/** True when a POST body is the RFC 8058 one-click signal. */
export function isOneClickUnsubscribeBody(body: string): boolean {
  const params = new URLSearchParams(body.trim());
  return (params.get("List-Unsubscribe") ?? "").trim() === "One-Click";
}

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Break any merge tags an admin typed (like *|EMAIL|*) so Mandrill cannot
 * fill them with member data. Only our own footer tag should merge.
 */
export function stripMergeTags(s: string): string {
  return s.replaceAll("*|", "* |").replaceAll("|*", "| *");
}

/** Returns an error message, or null when the subject and body are fine. */
export function validateEmailCampaign({
  subject,
  body,
}: {
  subject: string;
  body: string;
}): string | null {
  const s = subject.trim();
  const b = body.trim();
  if (!s) return "Email subject is required.";
  if (!b) return "Email body is required.";
  if (s.length > EMAIL_SUBJECT_MAX) {
    return `Email subject must be ${EMAIL_SUBJECT_MAX} characters or fewer.`;
  }
  if (b.length > EMAIL_BODY_MAX) {
    return `Email body must be ${EMAIL_BODY_MAX} characters or fewer.`;
  }
  return null;
}

/** The member's own email unsubscribe page (a person confirms with a button). */
export function unsubscribeUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}&channel=email`;
}

/** HTTPS URL a mail client POSTs to for RFC 8058 one-click unsubscribe. */
export function oneClickUnsubscribeUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/api/unsubscribe/one-click?token=${encodeURIComponent(token)}`;
}

/** List-Unsubscribe headers for one recipient (RFC 2369 + RFC 8058). */
export function listUnsubscribeHeaders(oneClickUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/**
 * Build the HTML and plain-text versions of a campaign email. The footer
 * names the brand and carries the per-member unsubscribe merge tag.
 */
export function buildCampaignEmail({
  subject,
  body,
  brandName,
  postalAddress,
}: {
  subject: string;
  body: string;
  brandName: string;
  postalAddress: string;
}): { html: string; text: string } {
  const safeSubject = stripMergeTags(subject.trim());
  const safeBody = stripMergeTags(body.trim());
  const safeBrand = stripMergeTags(brandName);
  const address = stripMergeTags(postalAddress.trim());

  const footerText =
    `You are getting this because you joined ${safeBrand} on Brand Engage Pro ` +
    `and said yes to email.`;

  const text =
    `${safeBody}\n\n--\n${footerText}\n` +
    (address ? `${address}\n` : "") +
    `Unsubscribe: ${UNSUB_MERGE_TAG}\n` +
    `Questions: support@brandengagepro.com`;

  const addressHtml = address ? `${escapeHtml(address)}<br>` : "";

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.5;color:#0f172a">
<p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b">${escapeHtml(safeBrand)}</p>
<h2 style="margin:0 0 16px;font-size:22px">${escapeHtml(safeSubject)}</h2>
<div style="white-space:pre-wrap">${escapeHtml(safeBody)}</div>
<p style="margin-top:32px;font-size:12px;color:#64748b">
${escapeHtml(footerText)}<br>
${addressHtml}
<a href="${UNSUB_MERGE_TAG}" style="color:#64748b">Unsubscribe from ${escapeHtml(safeBrand)} emails</a> ·
Questions? <a href="mailto:support@brandengagepro.com" style="color:#64748b">support@brandengagepro.com</a>
</p>
</div>
</body></html>`;

  return { html, text };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be at least 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type CampaignRecipient = {
  email: string;
  unsubUrl: string;
  oneClickUrl: string;
};

/** One Mandrill messages/send payload message for a batch of members. */
export function buildMandrillMessage({
  subject,
  html,
  text,
  fromEmail,
  fromName,
  replyTo,
  recipients,
  tags,
}: {
  subject: string;
  html: string;
  text: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  recipients: readonly CampaignRecipient[];
  tags: readonly string[];
}) {
  return {
    subject: stripMergeTags(subject.trim()),
    html,
    text,
    from_email: fromEmail,
    from_name: fromName,
    headers: {
      "Reply-To": replyTo,
      // Per-recipient URL via the merge tag. List-Unsubscribe-Post is the
      // same for every recipient (RFC 8058).
      "List-Unsubscribe": `<${ONECLICK_MERGE_TAG}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    to: recipients.map((r) => ({ email: r.email, type: "to" as const })),
    // Each member sees only their own address and their own unsubscribe link.
    preserve_recipients: false,
    merge: true,
    merge_language: "mailchimp" as const,
    merge_vars: recipients.map((r) => ({
      rcpt: r.email,
      vars: [
        { name: "UNSUB_URL", content: r.unsubUrl },
        { name: "UNSUB_ONECLICK", content: r.oneClickUrl },
      ],
    })),
    track_opens: true,
    track_clicks: true,
    tags: [...tags],
  };
}

/** Count Mandrill per-recipient results. "sent" and "queued" both count. */
export function countMandrillResults(results: unknown): { sent: number; failed: number } {
  if (!Array.isArray(results)) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const r of results) {
    const status = (r as { status?: unknown } | null)?.status;
    if (status === "sent" || status === "queued" || status === "scheduled") sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}
