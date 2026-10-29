import {
  EMAIL_SUBJECT_MAX,
  escapeHtml,
  oneLine,
  stripMergeTags,
} from "../email-campaign.ts";
import type { NearestReward } from "./lapsed.ts";

/**
 * "It's been a minute" email for members who went quiet 14–30 days ago.
 * Same shell as the weekly digest (lib/member-digest.ts) so the two read as
 * one series. Brand-neutral subject, one paragraph, one CTA, unsubscribe.
 */

export type LapsedBrand = { slug: string; name: string };

export type LapsedEmailInput = {
  firstName: string;
  /** Up to two are named; the first one's page is the CTA target. */
  brands: readonly LapsedBrand[];
  /** Spendable balance (SUM of points_ledger.delta). */
  pointsBalance: number;
  nearest: NearestReward | null;
  postalAddress: string;
  unsubscribeHref: string;
  /** App origin, no trailing slash. */
  baseHref: string;
};

export type LapsedEmailContent = {
  subject: string;
  html: string;
  text: string;
  /** Where the CTA points (also recorded on the notifications row). */
  ctaHref: string;
  ctaPath: string;
};

function clean(value: string): string {
  return oneLine(stripMergeTags(value));
}

export function lapsedSubject(firstName: string): string {
  const name = clean(firstName) || "there";
  const subject = `It's been a minute, ${name}`;
  if (subject.length <= EMAIL_SUBJECT_MAX) return subject;
  return `${subject.slice(0, EMAIL_SUBJECT_MAX - 1).trimEnd()}…`;
}

/** "Brand A", "Brand A and Brand B"; empty when no brand is named. */
export function brandPhrase(brands: readonly LapsedBrand[]): string {
  const names = brands
    .slice(0, 2)
    .map((b) => clean(b.name))
    .filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names[0]} and ${names[1]}`;
}

export function formatPoints(n: number): string {
  return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("en-US");
}

/** The one sentence about the reward, or empty when there is none to name. */
export function rewardSentence(nearest: NearestReward | null): string {
  if (!nearest || !nearest.affordability.known) return "";
  const title = clean(nearest.reward.title);
  if (!title) return "";
  const cost = formatPoints(nearest.reward.point_cost);
  if (nearest.affordability.canAfford) {
    return `That's enough to redeem ${title} (${cost} points) right now.`;
  }
  return `You're only ${formatPoints(nearest.affordability.shortfall)} points away from ${title} (${cost} points).`;
}

export function buildLapsedEmail(input: LapsedEmailInput): LapsedEmailContent {
  const name = clean(input.firstName) || "there";
  const safeName = escapeHtml(name);
  const address = clean(input.postalAddress);
  const subject = lapsedSubject(input.firstName);
  const brands = brandPhrase(input.brands);
  const points = formatPoints(input.pointsBalance);
  const reward = rewardSentence(input.nearest);

  const base = input.baseHref.replace(/\/+$/, "");
  const first = input.brands[0];
  const ctaPath = first?.slug ? `/brands/${encodeURIComponent(first.slug)}` : "/";
  const ctaHref = ctaPath === "/" ? base : `${base}${ctaPath}`;
  const ctaLabel = first ? `Visit ${clean(first.name) || "your brand"}` : "See what's new";

  const paragraph = [
    brands ? `${brands} ${input.brands.length > 1 ? "have" : "has"} kept going while you were away.` : "Your brands kept going while you were away.",
    `You still have ${points} points.`,
    reward,
  ]
    .filter(Boolean)
    .join(" ");

  const text = [
    `Hey ${name}, it's been a minute.`,
    "",
    paragraph,
    "",
    `${ctaLabel}: ${ctaHref}`,
    "",
    "You're getting this because you opted in to Brand Engage Pro member emails.",
    address,
    `Unsubscribe: ${input.unsubscribeHref}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const paragraphHtml = escapeHtml(paragraph).replace(
    escapeHtml(`${points} points`),
    `<b style="color:#1e1b17;">${escapeHtml(points)} points</b>`,
  );

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eadfcb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e1b17;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eadfcb;padding:40px 20px;">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#f5efe4;border:1px solid rgba(30,27,23,0.14);border-radius:8px;overflow:hidden;">
        <tr><td style="padding:32px 32px 0;border-bottom:1px solid rgba(30,27,23,0.14);">
          <p style="margin:0 0 4px;font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#7a5a06;">Brand Engage Pro</p>
          <h1 style="margin:0 0 24px;font-family:'Young Serif',Georgia,serif;font-size:26px;font-weight:400;line-height:1.2;color:#1e1b17;">Hey ${safeName}, it&rsquo;s been a minute</h1>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <p style="margin:0;font-size:15px;line-height:1.6;color:#1e1b17;">${paragraphHtml}</p>
        </td></tr>
        <tr><td style="padding:0 32px 32px;">
          <a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:#9b2335;color:#f5efe4;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:999px;">
            ${escapeHtml(ctaLabel)}
          </a>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid rgba(30,27,23,0.14);">
          <p style="margin:0;font-size:11px;line-height:1.5;color:#5a5650;">You&rsquo;re getting this because you opted in to Brand Engage Pro member emails.<br>${escapeHtml(address)}<br><a href="${escapeHtml(input.unsubscribeHref)}" mc:disable-tracking style="color:#9b2335;">Unsubscribe</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text, ctaHref, ctaPath };
}
