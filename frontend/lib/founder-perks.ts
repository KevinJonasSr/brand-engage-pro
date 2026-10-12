/**
 * Founder perks. Pure functions only, so they can be unit tested and shared
 * by the brand page, the RSVP button, the admin event forms and check-in.
 *
 *   - Founders earn a flat 1.5x points. Premium also earns 1.5x, and the
 *     two do not stack: a founder on Premium still earns 1.5x.
 *   - New events can be founders-first for a configurable number of hours
 *     (brand default 48, per event override, 0 turns it off). Founder-only
 *     events are founders-only anyway.
 *
 * Mirrored in SQL by public.points_multiplier, the award-function ledger
 * notes, and apply_founder_early_rsvp_window
 * (supabase/migrations/0076_founder_early_rsvp_window.sql and
 * 0077_founder_points_flat.sql; default raised to 48 in
 * 0079_founder_early_rsvp_default_48.sql). Change both together.
 */

export const FOUNDER_POINTS_BONUS = 0.5;
export const PREMIUM_POINTS_BONUS = 0.5;
/** Default early window for a brand that has not set its own. */
export const FOUNDER_EARLY_RSVP_HOURS = 48;
/** Longest window an admin can save. Matches the SQL check constraints. */
export const MAX_FOUNDER_EARLY_RSVP_HOURS = 168;
/** Ledger suffix for a founder bonus. Premium-only rows keep their own label. */
export const FOUNDER_LEDGER_LABEL = "Founder 1.5x";

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
  if (isFounder) return 1 + FOUNDER_POINTS_BONUS;
  if (isPremium) return 1 + PREMIUM_POINTS_BONUS;
  return 1;
}

/** Whole points after the multiplier. Matches PostgreSQL round() for .5. */
export function scaledPoints(base: number, multiplier: number): number {
  return Math.round(base * multiplier);
}

/**
 * Ledger note. Founders are labeled "Founder 1.5x" even when they also have
 * Premium, because the bonus is flat 1.5x and does not stack.
 */
export function ledgerNote(
  base: string,
  { isFounder, isPremium }: { isFounder: boolean; isPremium: boolean },
): string {
  if (isFounder) return `${base} (${FOUNDER_LEDGER_LABEL})`;
  if (isPremium) return `${base} (premium 1.5×)`;
  return base;
}

/**
 * Parse an admin hours field.
 * null = blank (inherit on create, leave the current window alone on edit).
 * "invalid" = not a whole number from 0 through MAX_FOUNDER_EARLY_RSVP_HOURS.
 */
export function parseEarlyRsvpHours(
  raw: string | null | undefined,
): number | null | "invalid" {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return "invalid";
  const hours = Number(trimmed);
  if (hours > MAX_FOUNDER_EARLY_RSVP_HOURS) return "invalid";
  return hours;
}

/**
 * Hours that apply to a new event. A per-event number wins, including 0.
 * Otherwise the brand setting, otherwise the 48-hour default.
 */
export function resolveEarlyRsvpHours(
  eventHours: number | null | undefined,
  brandHours: number | null | undefined,
): number {
  const chosen = eventHours ?? brandHours ?? FOUNDER_EARLY_RSVP_HOURS;
  if (!Number.isInteger(chosen) || chosen < 0 || chosen > MAX_FOUNDER_EARLY_RSVP_HOURS) {
    return FOUNDER_EARLY_RSVP_HOURS;
  }
  return chosen;
}

/**
 * When RSVPs open to everyone. Null means open immediately (0 hours).
 * `hours` defaults to the brand default of 48.
 */
export function publicRsvpOpensAt(
  createdAt: Date,
  hours: number = FOUNDER_EARLY_RSVP_HOURS,
): Date | null {
  if (hours <= 0) return null;
  return new Date(createdAt.getTime() + hours * HOUR_MS);
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
