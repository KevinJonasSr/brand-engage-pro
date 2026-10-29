import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "../send";

/**
 * Send an immediate RSVP confirmation when a member RSVPs to an event. Same-
 * day, instant feedback that their reservation went through.
 *
 * `bypassQuietHours` is intentionally true here — the member literally just
 * tapped RSVP, they want the confirmation regardless of the hour.
 *
 * `bypassSmsTierGate` is also true — RSVP confirmations are valuable to
 * any tier, not just Gold+.
 */
export async function notifyRsvpConfirmation(opts: {
  memberId: string;
  eventId: string;
  brandSlug: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: event } = await admin
      // brand_events (not the Member Engage artist_events table this file
      // was forked from — that table does not exist here, so this push
      // never fired).
      .from("brand_events")
      .select("title, starts_at, event_date, location")
      .eq("id", opts.eventId)
      .maybeSingle();
    if (!event) return;

    const dateStr = event.starts_at
      ? new Date(event.starts_at as string).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      : ((event.event_date as string | null) || "Soon");
    const venueStr = ((event.location as string | null) ?? "").trim();

    await sendNotification({
      memberId: opts.memberId,
      type: "rsvp_confirmation",
      payload: {
        title: `You're going to ${event.title as string}`,
        body: venueStr ? `${dateStr} · ${venueStr}` : dateStr,
        url: `/brands/${opts.brandSlug}#event-${opts.eventId}`,
        tag: `rsvp_confirmation:${opts.eventId}`,
      },
      bypassQuietHours: true,
      bypassSmsTierGate: true,
    });
  } catch (err) {
    console.warn("notifyRsvpConfirmation failed (non-blocking):", err);
  }
}
