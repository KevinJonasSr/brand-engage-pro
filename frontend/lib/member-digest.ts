import {
  EMAIL_SUBJECT_MAX,
  escapeHtml,
  isEmailAddress,
  normalizeEmailAddress,
  oneLine,
  stripMergeTags,
} from "./email-campaign.ts";

export type DigestStats = {
  pointsEarned: number;
  rsvpsAdded: number;
  commentsAdded: number;
  reactionsGiven: number;
  topBrandName: string | null;
};

/**
 * True when the member did something in the weekly counters.
 * A stored visit streak is not enough: it stays put until the next visit,
 * so a months-old streak would otherwise look like this week's activity.
 */
export function digestHasWeeklyActions(
  stats: Pick<DigestStats, "pointsEarned" | "rsvpsAdded" | "commentsAdded" | "reactionsGiven">,
): boolean {
  return stats.pointsEarned + stats.rsvpsAdded + stats.commentsAdded + stats.reactionsGiven > 0;
}

/**
 * True when last_active_date (YYYY-MM-DD) is inside about a week.
 * Used so the digest does not quote a frozen streak.
 */
export function streakIsCurrent(
  lastActiveDate: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastActiveDate) return false;
  const day = lastActiveDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const last = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(last)) return false;
  const age = now.getTime() - last;
  return age >= -36 * 60 * 60 * 1000 && age <= 8 * 24 * 60 * 60 * 1000;
}

/**
 * One test recipient from ?testEmail=, or null when the param is absent.
 * "invalid" means the caller must send nothing.
 */
export function parseTestEmailParam(raw: string | null): string | null | "invalid" {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/[,;\s]/.test(trimmed) || !isEmailAddress(trimmed)) return "invalid";
  return normalizeEmailAddress(trimmed);
}

export function digestSubject(topBrandName: string | null): string {
  const brand = oneLine(stripMergeTags(topBrandName ?? "")) || "Brand Engage Pro";
  const subject = `Your week at ${brand} ✨`;
  if (subject.length <= EMAIL_SUBJECT_MAX) return subject;
  return `${subject.slice(0, EMAIL_SUBJECT_MAX - 1).trimEnd()}…`;
}

export function buildDigestContent({
  firstName,
  recap,
  streakDays,
  postalAddress,
  unsubscribeHref,
  homeHref,
  lastActiveDate,
  now,
}: {
  firstName: string;
  recap: DigestStats;
  streakDays: number;
  postalAddress: string;
  unsubscribeHref: string;
  homeHref: string;
  lastActiveDate?: string | null;
  now?: Date;
}): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(oneLine(stripMergeTags(firstName)) || "there");
  const showStreak = streakDays > 0 && streakIsCurrent(lastActiveDate, now);
  const address = oneLine(stripMergeTags(postalAddress));
  const subject = digestSubject(recap.topBrandName);

  const statParts = [
    recap.pointsEarned > 0 ? `${recap.pointsEarned} points earned` : null,
    recap.rsvpsAdded > 0
      ? `${recap.rsvpsAdded} event RSVP${recap.rsvpsAdded > 1 ? "s" : ""}`
      : null,
    recap.commentsAdded > 0
      ? `${recap.commentsAdded} comment${recap.commentsAdded > 1 ? "s" : ""}`
      : null,
    recap.reactionsGiven > 0
      ? `${recap.reactionsGiven} reaction${recap.reactionsGiven > 1 ? "s" : ""} given`
      : null,
    showStreak ? `${streakDays}-day visit streak` : null,
  ].filter((part): part is string => Boolean(part));

  const statsText = statParts.join(" · ");
  const brandLine = recap.topBrandName
    ? `Your most active brand this week: ${oneLine(stripMergeTags(recap.topBrandName))}.`
    : "";

  const text = [
    `Hey ${oneLine(stripMergeTags(firstName)) || "there"}, here's your week.`,
    "",
    statsText,
    brandLine,
    "",
    `See your dashboard: ${homeHref}`,
    "",
    "You're getting this because you opted in to Brand Engage Pro member emails.",
    address,
    `Unsubscribe: ${unsubscribeHref}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const statsHtml = statParts
    .map((part) => {
      const html = escapeHtml(part).replace(/^(\d+(?:-day)?)/, "<b>$1</b>");
      return html;
    })
    .join(" · ");

  const brandHtml = recap.topBrandName
    ? `<p style="color:#5a5650;font-size:13px;">Your most active brand this week: <b style="color:#1e1b17;">${escapeHtml(oneLine(stripMergeTags(recap.topBrandName)))}</b></p>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eadfcb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e1b17;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eadfcb;padding:40px 20px;">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#f5efe4;border:1px solid rgba(30,27,23,0.14);border-radius:8px;overflow:hidden;">
        <tr><td style="padding:32px 32px 0;border-bottom:1px solid rgba(30,27,23,0.14);">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#7a5a06;">Brand Engage Pro</p>
          <h1 style="margin:0 0 24px;font-family:'Young Serif',Georgia,serif;font-size:26px;font-weight:400;line-height:1.2;color:#1e1b17;">Hey ${safeName}, here&rsquo;s your week</h1>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#1e1b17;">${statsHtml}</p>
          ${brandHtml}
        </td></tr>
        <tr><td style="padding:0 32px 32px;">
          <a href="${escapeHtml(homeHref)}" style="display:inline-block;background:#9b2335;color:#f5efe4;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:999px;">
            See your dashboard
          </a>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid rgba(30,27,23,0.14);">
          <p style="margin:0;font-size:11px;line-height:1.5;color:#5a5650;">You&rsquo;re getting this because you opted in to Brand Engage Pro member emails.<br>${escapeHtml(address)}<br><a href="${escapeHtml(unsubscribeHref)}" mc:disable-tracking style="color:#9b2335;">Unsubscribe</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
