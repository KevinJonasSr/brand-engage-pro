import { createAdminClient } from "@/lib/supabase/admin";
import { broadcastBrandEmail, broadcastSms, type BroadcastResult } from "@/lib/broadcast";
import {
  NELLIES_BOURBON_TITLE,
  isBourbonCigarTitle,
  resolveBourbonGuestCopy,
} from "@/lib/nellies-launch";
import {
  EMAIL_ALLOWLIST_HOLD,
  buildDefaultReminderCopy,
  reminderNeedsEmailRetry,
  scheduledEmailGateOpen,
} from "@/lib/reminder-copy";
import { parseEmailAllowlist } from "@/lib/email-campaign";

export type ReminderKind = "reminder_24h" | "reminder_1h" | "manual";

export interface ReminderWindowEvent {
  id: string;
  brand_slug: string;
  title: string;
  detail: string | null;
  starts_at: string;
  location: string | null;
  url: string | null;
  reminder_sms_template: string | null;
  brand_name: string | null;
}

/**
 * Find events whose starts_at falls inside a reminder window and haven't
 * had this kind of reminder fired yet. The window is a bit wider than the
 * cron cadence (every 15 min) so we don't miss an event sitting right on
 * the boundary.
 */
export async function loadEventsInReminderWindow(kind: "reminder_24h" | "reminder_1h") {
  const admin = createAdminClient();
  const now = Date.now();

  // Center of the target window + 15 min half-width on each side.
  const offsetMinutes = kind === "reminder_24h" ? 24 * 60 : 60;
  const halfWidthMs = 15 * 60 * 1000;
  const center = now + offsetMinutes * 60 * 1000;
  const windowStart = new Date(center - halfWidthMs).toISOString();
  const windowEnd = new Date(center + halfWidthMs).toISOString();

  const { data: candidates } = await admin
    .from("brand_events")
    .select("id, brand_slug, title, detail, starts_at, location, url, reminder_sms_template")
    .eq("active", true)
    .not("starts_at", "is", null)
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd);

  if (!candidates || candidates.length === 0) return [];

  // Filter out events that already had this reminder fired.
  // A row that never emailed because the send switch or allowlist blocked
  // it is still eligible while the event is inside this window and the
  // gate is now open.
  const ids = candidates.map((c) => c.id as string);
  const { data: already } = await admin
    .from("event_reminders")
    .select("event_id, error, recipients_email")
    .in("event_id", ids)
    .eq("kind", kind);
  const gateOpen = scheduledEmailGateOpen();
  const alreadySet = new Set(
    (already ?? [])
      .filter((row) => {
        const needsRetry = reminderNeedsEmailRetry({
          error: (row.error as string | null) ?? null,
          recipients_email: (row.recipients_email as number | null) ?? 0,
        });
        return !(needsRetry && gateOpen);
      })
      .map((row) => row.event_id as string),
  );

  const remaining = candidates.filter((c) => !alreadySet.has(c.id as string));
  if (remaining.length === 0) return [];

  // Attach brand name for nicer default template copy.
  const slugs = [...new Set(remaining.map((r) => r.brand_slug as string))];
  const { data: brands } = await admin
    .from("brands")
    .select("slug, name")
    .in("slug", slugs);
  const byName = new Map((brands ?? []).map((a) => [a.slug as string, a.name as string]));

  return remaining.map((r) => {
    const bourbon = isBourbonCigarTitle(String(r.title ?? ""))
      ? resolveBourbonGuestCopy({
          detail: (r.detail as string | null) ?? null,
          location: (r.location as string | null) ?? null,
        })
      : null;
    return {
      id: r.id as string,
      brand_slug: r.brand_slug as string,
      title: bourbon ? NELLIES_BOURBON_TITLE : (r.title as string),
      detail: bourbon ? bourbon.detail : ((r.detail as string | null) ?? null),
      starts_at: r.starts_at as string,
      location: bourbon ? bourbon.location : ((r.location as string | null) ?? null),
      url: (r.url as string | null) ?? null,
      reminder_sms_template: (r.reminder_sms_template as string | null) ?? null,
      brand_name: byName.get(r.brand_slug as string) ?? null,
    } as ReminderWindowEvent;
  });
}

type ReminderRow = {
  id: string;
  recipients_sms: number;
  recipients_email: number;
  error: string | null;
};

function emailErrorText(smsError: string | undefined, emailError: string | undefined): string {
  return (
    (smsError ? `sms: ${smsError}` : "") +
    (emailError ? (smsError ? " | " : "") + `email: ${emailError}` : "")
  );
}

/**
 * Fire SMS + email reminder for a single event to all opted-in RSVPers.
 * Records one event_reminders row with delivery counts; caller is
 * responsible for swallowing any errors so one bad event doesn't break
 * the whole cron run.
 *
 * Scheduled email stays held while BEP_EMAIL_ALLOWLIST is set, and a row
 * that never actually emailed (the send switch was off, or the allowlist
 * was holding it) is emailed once the gate is open if the event is still
 * in the window. That retry does not send the SMS again.
 */
export async function sendEventReminder(
  event: ReminderWindowEvent,
  kind: ReminderKind,
): Promise<{ smsRecipients: number; emailRecipients: number; error?: string }> {
  const admin = createAdminClient();
  const copy = buildDefaultReminderCopy(event, kind);
  const smsBody = event.reminder_sms_template || copy.sms;

  let existing: ReminderRow | null = null;
  if (kind !== "manual") {
    const { data } = await admin
      .from("event_reminders")
      .select("id, recipients_sms, recipients_email, error")
      .eq("event_id", event.id)
      .eq("kind", kind)
      .maybeSingle();
    existing = (data as ReminderRow | null) ?? null;
  }

  const allow = parseEmailAllowlist();
  const holdForAllowlist = kind !== "manual" && allow.ok && allow.emails !== null;
  const retryEmailOnly =
    existing != null && reminderNeedsEmailRetry(existing) && scheduledEmailGateOpen();

  const emptyEmail: BroadcastResult = {
    attempted: 0,
    sent: 0,
    failed: 0,
    recipients: 0,
    error: EMAIL_ALLOWLIST_HOLD,
  };

  let smsResult: BroadcastResult;
  let emailResult: BroadcastResult;
  if (retryEmailOnly) {
    smsResult = {
      attempted: 0,
      sent: existing?.recipients_sms ?? 0,
      failed: 0,
      recipients: 0,
    };
    emailResult = await broadcastBrandEmail({
      subject: copy.subject,
      body: copy.email,
      brandSlug: event.brand_slug,
      eventId: event.id,
    });
  } else if (holdForAllowlist) {
    smsResult = await broadcastSms({
      body: smsBody,
      brandSlug: event.brand_slug,
      eventId: event.id,
    });
    emailResult = emptyEmail;
  } else {
    [smsResult, emailResult] = await Promise.all([
      broadcastSms({ body: smsBody, brandSlug: event.brand_slug, eventId: event.id }),
      broadcastBrandEmail({
        subject: copy.subject,
        body: copy.email,
        brandSlug: event.brand_slug,
        eventId: event.id,
      }),
    ]);
  }

  const error = emailErrorText(smsResult.error, emailResult.error);
  const row = {
    recipients_sms: smsResult.sent,
    recipients_email: emailResult.sent,
    error: error || null,
  };

  if (existing) {
    await admin.from("event_reminders").update(row).eq("id", existing.id);
  } else {
    await admin.from("event_reminders").insert({
      event_id: event.id,
      community_id: event.brand_slug,
      kind,
      ...row,
    });
  }

  return {
    smsRecipients: smsResult.sent,
    emailRecipients: emailResult.sent,
    error: error || undefined,
  };
}
