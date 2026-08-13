import { createAdminClient } from "@/lib/supabase/admin";
import { broadcastEmail, broadcastSms } from "@/lib/broadcast";
import {
  NELLIES_BOURBON_TITLE,
  isBourbonCigarTitle,
  resolveBourbonGuestCopy,
} from "@/lib/nellies-launch";

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
  const ids = candidates.map((c) => c.id as string);
  const { data: already } = await admin
    .from("event_reminders")
    .select("event_id")
    .in("event_id", ids)
    .eq("kind", kind);
  const alreadySet = new Set((already ?? []).map((r) => r.event_id as string));

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

function buildDefaultReminderCopy(event: ReminderWindowEvent, kind: ReminderKind): {
  subject: string;
  sms: string;
  email: string;
} {
  const when =
    kind === "reminder_24h"
      ? "tomorrow"
      : kind === "reminder_1h"
        ? "in 1 hour"
        : "soon";
  const brandName = event.brand_name ?? "Your brand";
  const locBit = event.location ? ` at ${event.location}` : "";
  const linkBit = event.url ? ` Link: ${event.url}` : "";
  const sms = `${brandName}'s ${event.title} starts ${when}${locBit}.${linkBit} See you there!`;
  const subject = `Reminder: ${event.title} starts ${when}`;
  const email =
    `Hey — quick heads up: ${brandName}'s ${event.title} starts ${when}${locBit}.\n\n` +
    (event.detail ? `${event.detail}\n\n` : "") +
    (event.url ? `Details: ${event.url}\n\n` : "") +
    `Thanks for RSVPing.`;
  return { subject, sms, email };
}

/**
 * Fire SMS + email reminder for a single event to all opted-in RSVPers.
 * Records one event_reminders row with delivery counts; caller is
 * responsible for swallowing any errors so one bad event doesn't break
 * the whole cron run.
 */
export async function sendEventReminder(
  event: ReminderWindowEvent,
  kind: ReminderKind,
): Promise<{ smsRecipients: number; emailRecipients: number; error?: string }> {
  const admin = createAdminClient();
  const copy = buildDefaultReminderCopy(event, kind);
  const smsBody = event.reminder_sms_template || copy.sms;

  const [smsResult, emailResult] = await Promise.all([
    broadcastSms({ body: smsBody, brandSlug: event.brand_slug, eventId: event.id }),
    broadcastEmail({ subject: copy.subject, body: copy.email }),
  ]);

  const error =
    (smsResult.error ? `sms: ${smsResult.error}` : "") +
    (emailResult.error ? (smsResult.error ? " | " : "") + `email: ${emailResult.error}` : "");

  await admin.from("event_reminders").insert({
    event_id: event.id,
    kind,
    recipients_sms: smsResult.sent,
    recipients_email: emailResult.sent,
    error: error || null,
  });

  return {
    smsRecipients: smsResult.sent,
    emailRecipients: emailResult.sent,
    error: error || undefined,
  };
}
