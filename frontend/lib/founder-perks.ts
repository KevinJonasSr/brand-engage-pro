/**
 * Founder perks (item 9). Pure functions only, so they can be unit tested
 * and shared by the brand page, the RSVP button and the RSVP server action.
 *
 *   - Founders earn 1.5x points for life. Premium also earns 1.5x, and the
 *     two bonuses stack, so a founder on Premium earns 2x.
 *   - Founders can RSVP to public and premium events 48 hours before
 *     everyone else. Founder-only events are founders-only anyway.
 *
 * Mirrored in SQL by public.points_multiplier and the
 * event_rsvps_founders_first trigger
 * (supabase/migrations/0074_founder_perks.sql). Change both together.
 */

export const FOUNDER_POINTS_BONUS = 0.5;
export const PREMIUM_POINTS_BONUS = 0.5;
export const FOUNDER_EARLY_RSVP_HOURS = 48;

/** Error text raised by the SQL trigger when a non-founder RSVPs too early. */
export const FOUNDERS_FIRST_ERROR = "Founders RSVP first";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export function pointsMultiplier({
  isPremium,
  isFounder,
}: {
  isPremium: boolean;
  isFounder: boolean;
}): number {
  return (
    1 +
    (isPremium ? PREMIUM_POINTS_BONUS : 0) +
    (isFounder ? FOUNDER_POINTS_BONUS : 0)
  );
}

/** When RSVPs open to everyone, for an event created at this time. */
export function publicRsvpOpensAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + FOUNDER_EARLY_RSVP_HOURS * HOUR_MS);
}

/**
 * True when this member can RSVP right now. Founders always can. Everyone
 * else waits until opensAt. A missing or bad opensAt means already open.
 */
export function canRsvpNow({
  isFounder,
  opensAt,
  now = new Date(),
}: {
  isFounder: boolean;
  opensAt: string | null | undefined;
  now?: Date;
}): boolean {
  if (isFounder || !opensAt) return true;
  const opens = new Date(opensAt).getTime();
  if (Number.isNaN(opens)) return true;
  return now.getTime() >= opens;
}

/** Milliseconds until RSVPs open to everyone, or 0 when already open. */
export function msUntilOpen(
  opensAt: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!opensAt) return 0;
  const opens = new Date(opensAt).getTime();
  if (Number.isNaN(opens)) return 0;
  return Math.max(0, opens - now.getTime());
}

/** Short countdown like "1d 4h", "3h 12m" or "45m". Rounds up to the minute. */
export function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / MINUTE_MS));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** True when a database error is the founders-first window refusal. */
export function isFoundersWindowError(message: string | null | undefined): boolean {
  return Boolean(message && message.includes(FOUNDERS_FIRST_ERROR));
}
