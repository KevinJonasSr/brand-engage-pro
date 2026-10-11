import { createAdminClient } from "@/lib/supabase/admin";
import {
  MANDRILL_BATCH_SIZE,
  appBaseUrl,
  buildCampaignEmail,
  buildMandrillMessage,
  chunk,
  countMandrillResults,
  mailingAddress,
  marketingEmailBlockReason,
  oneClickUnsubscribeUrl,
  unsubscribeUrl,
  validateEmailCampaign,
} from "@/lib/email-campaign";
import { isInQuietHours } from "@/lib/notifications/preferences";
import type { NotificationPreferences } from "@/lib/notifications/types";
import { isSmsQuietTime, withStopFooter } from "@/lib/sms-compliance";

const MANDRILL_SEND_URL = "https://mandrillapp.com/api/1.0/messages/send";
const DEFAULT_FROM_EMAIL = "hello@brandengagepro.com";
const DEFAULT_REPLY_TO = "support@brandengagepro.com";

/**
 * Campaign broadcast helpers — send a single email or SMS blast to every member
 * of an brand (or every member globally) who has opted in via the matching
 * channel. Safe to call from server actions and API routes.
 */

export type BroadcastResult = {
  attempted: number;
  sent: number;
  failed: number;
  recipients: number; // how many members matched before any send
  /** SMS only: members held back because it is quiet hours for them. */
  skippedQuietHours?: number;
  error?: string;
};

async function loadRecipients(opts: {
  brandSlug?: string | null;
  eventId?: string | null;
  memberIds?: string[] | null;
  channel: "email" | "sms";
}) {
  const admin = createAdminClient();
  const optColumn = opts.channel === "email" ? "email_opted_in" : "sms_opted_in";
  const contactColumn = opts.channel === "email" ? "email" : "phone";

  // Audience precedence (most specific wins):
  //   eventId  → members who RSVPed to this event (for reminder blasts)
  //   brand   → members who follow that brand
  //   (none)   → every opted-in member (platform-wide announcement)
  let scopedIds: string[] | null = null;

  if (opts.eventId) {
    const { data } = await admin
      .from("event_rsvps")
      .select("member_id")
      .eq("event_id", opts.eventId);
    scopedIds = (data ?? []).map((r) => r.member_id as string);
    if (scopedIds.length === 0) return [];
  } else if (opts.brandSlug) {
    const { data } = await admin
      .from("member_brand_following")
      .select("member_id")
      .eq("brand_slug", opts.brandSlug);
    scopedIds = (data ?? []).map((f) => f.member_id as string);
    if (scopedIds.length === 0) return [];
  }

  let query = admin
    .from("members")
    .select("id, first_name, email, phone, unsubscribe_token, sms_opted_in, email_opted_in, suspended")
    .eq(optColumn, true)
    .eq("suspended", false)
    .not(contactColumn, "is", null);

  if (scopedIds) query = query.in("id", scopedIds);
  // Optional narrower audience (for example a tier filter chosen by an admin).
  if (opts.memberIds) {
    if (opts.memberIds.length === 0) return [];
    query = query.in("id", opts.memberIds);
  }

  const { data, error } = await query;

  if (error) throw error;

  // A brand admin suspends a member per brand (membership status), not
  // globally. Leave those members out of that brand's blasts.
  let rows = data ?? [];
  if (opts.brandSlug && rows.length > 0) {
    const { data: suspended, error: suspendedError } = await admin
      .from("member_community_memberships")
      .select("member_id")
      .eq("community_id", opts.brandSlug)
      .eq("status", "suspended");
    if (suspendedError) throw suspendedError;
    const blocked = new Set((suspended ?? []).map((m) => m.member_id as string));
    rows = rows.filter((r) => !blocked.has(r.id as string));
  }

  return rows as Array<{
    id: string;
    first_name: string | null;
    email: string | null;
    phone: string | null;
    unsubscribe_token: string | null;
  }>;
}

type QuietPrefs = Pick<NotificationPreferences, "timezone" | "quiet_start" | "quiet_end">;

/**
 * Members it is quiet hours for right now: 9pm to 8am in their time zone,
 * or inside the quiet window they set. Members with no preferences row are
 * checked against the default time zone.
 */
async function quietHoursMemberIds(memberIds: string[], now: Date = new Date()): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notification_preferences")
    .select("member_id, timezone, quiet_start, quiet_end")
    .in("member_id", memberIds);
  if (error) throw error;
  const prefsById = new Map(
    (data ?? []).map((p) => [p.member_id as string, p as unknown as QuietPrefs]),
  );
  const quiet = new Set<string>();
  for (const id of memberIds) {
    const prefs = prefsById.get(id);
    const inOwnWindow = prefs ? isInQuietHours(prefs as NotificationPreferences, now) : false;
    if (inOwnWindow || isSmsQuietTime(prefs?.timezone, now)) quiet.add(id);
  }
  return quiet;
}

/**
 * Send an SMS to every opted-in member via Twilio. Members it is quiet
 * hours for are skipped and counted in `skippedQuietHours`.
 */
export async function broadcastSms(params: {
  body: string;
  brandSlug?: string | null;
  eventId?: string | null;
  memberIds?: string[] | null;
}): Promise<BroadcastResult> {
  const result: BroadcastResult = { attempted: 0, sent: 0, failed: 0, recipients: 0 };

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const defaultFrom = process.env.TWILIO_DEFAULT_FROM;
  if (!accountSid || !authToken || (!messagingServiceSid && !defaultFrom)) {
    return { ...result, error: "Twilio not configured" };
  }

  const recipients = await loadRecipients({
    brandSlug: params.brandSlug,
    eventId: params.eventId,
    memberIds: params.memberIds,
    channel: "sms",
  });
  result.recipients = recipients.length;
  if (recipients.length === 0) return result;

  const quiet = await quietHoursMemberIds(recipients.map((r) => r.id));
  result.skippedQuietHours = quiet.size;

  const { default: twilio } = await import("twilio");
  const client = twilio(accountSid, authToken);

  // Append the carrier-required STOP footer once per message. Twilio also
  // handles STOP automatically, but the explicit footer keeps us in good
  // standing with US carriers (10DLC compliance).
  const smsBody = withStopFooter(params.body);

  for (const member of recipients) {
    if (!member.phone || quiet.has(member.id)) continue;
    result.attempted += 1;
    try {
      await client.messages.create({
        to: member.phone,
        body: smsBody,
        ...(messagingServiceSid
          ? { messagingServiceSid }
          : { from: defaultFrom as string }),
      });
      result.sent += 1;
    } catch (err) {
      console.error("broadcastSms: send failed for", member.id, err);
      result.failed += 1;
    }
    // Throttle to stay under Twilio trial rate limits (1 msg/sec).
    await new Promise((r) => setTimeout(r, 250));
  }

  return result;
}

/**
 * Send a brand-scoped email campaign through Mailchimp Transactional
 * (Mandrill). Only members who follow this brand (or RSVPed to the event)
 * and opted in to email get it, one message each, with their own
 * unsubscribe link. Replaces the old unscoped Mailchimp list broadcast.
 */
export async function broadcastBrandEmail(params: {
  subject: string;
  body: string;
  brandSlug: string;
  eventId?: string | null;
  memberIds?: string[] | null;
}): Promise<BroadcastResult> {
  const result: BroadcastResult = { attempted: 0, sent: 0, failed: 0, recipients: 0 };

  const invalid = validateEmailCampaign(params);
  if (invalid) return { ...result, error: invalid };
  if (!params.brandSlug) return { ...result, error: "Email campaigns need a brand." };

  const blocked = marketingEmailBlockReason();
  if (blocked) return { ...result, error: blocked };
  const apiKey = process.env.MAILCHIMP_TRANSACTIONAL_API_KEY as string;
  const postalAddress = mailingAddress() as string;

  const recipients = await loadRecipients({
    brandSlug: params.brandSlug,
    eventId: params.eventId,
    memberIds: params.memberIds,
    channel: "email",
  });
  result.recipients = recipients.length;
  if (recipients.length === 0) return result;

  const admin = createAdminClient();
  const { data: brand } = await admin
    .from("brands")
    .select("name")
    .eq("slug", params.brandSlug)
    .maybeSingle();
  const brandName = (brand?.name as string | undefined) ?? "Brand Engage Pro";

  const appUrl = appBaseUrl();
  const { html, text } = buildCampaignEmail({
    subject: params.subject,
    body: params.body,
    brandName,
    postalAddress,
  });

  const withEmail = recipients.filter(
    (r): r is typeof r & { email: string; unsubscribe_token: string } =>
      Boolean(r.email && r.unsubscribe_token),
  );

  for (const batch of chunk(withEmail, MANDRILL_BATCH_SIZE)) {
    result.attempted += batch.length;
    const message = buildMandrillMessage({
      subject: params.subject,
      html,
      text,
      fromEmail: process.env.BEP_EMAIL_FROM ?? DEFAULT_FROM_EMAIL,
      fromName: brandName,
      replyTo: process.env.BEP_EMAIL_REPLY_TO ?? DEFAULT_REPLY_TO,
      recipients: batch.map((r) => ({
        email: r.email,
        unsubUrl: unsubscribeUrl(appUrl, r.unsubscribe_token),
        oneClickUrl: oneClickUnsubscribeUrl(appUrl, r.unsubscribe_token),
      })),
      tags: ["campaign", params.brandSlug],
    });
    try {
      const res = await fetch(MANDRILL_SEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: apiKey, message }),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        console.error("broadcastBrandEmail: Mandrill error", res.status, detail);
        result.failed += batch.length;
        result.error = `Mandrill send failed: ${res.status}`;
        continue;
      }
      const counts = countMandrillResults(await res.json());
      result.sent += counts.sent;
      result.failed += batch.length - counts.sent;
    } catch (err) {
      console.error("broadcastBrandEmail: fetch failed", err);
      result.failed += batch.length;
      result.error = err instanceof Error ? err.message : String(err);
    }
  }

  return result;
}
