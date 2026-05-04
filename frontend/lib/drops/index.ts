/**
 * Limited-time drops (rewards + specials) — pure helpers used by both the member-side
 * catalog and the admin-side cron. No DB calls in here; all functions
 * take the row as input and decide based on its drop window.
 *
 * "Live drop" = is_drop && drops_at <= now < expires_at
 * "Upcoming drop" = is_drop && drops_at > now
 * "Expired drop" = is_drop && expires_at <= now
 *
 * Rows with `is_drop = false` (the always-on catalog (regular rewards or non-time-bound specials)) are
 * never affected by these helpers.
 */

export interface DropTimingFields {
  is_drop: boolean;
  drops_at: string | null;
  expires_at: string | null;
}

export type DropPhase = "not-a-drop" | "upcoming" | "live" | "expired";

export function dropPhase(
  reward: DropTimingFields,
  now: Date = new Date(),
): DropPhase {
  if (!reward.is_drop) return "not-a-drop";
  const t = now.getTime();
  const dropsAt = reward.drops_at ? new Date(reward.drops_at).getTime() : null;
  const expiresAt = reward.expires_at
    ? new Date(reward.expires_at).getTime()
    : null;

  if (dropsAt !== null && t < dropsAt) return "upcoming";
  if (expiresAt !== null && t >= expiresAt) return "expired";
  return "live";
}

/** True if the row is currently active/valid. Always true for non-drops. */
export function isRedeemableNow(
  reward: DropTimingFields,
  now: Date = new Date(),
): boolean {
  const phase = dropPhase(reward, now);
  return phase === "not-a-drop" || phase === "live";
}

/**
 * Seconds until the next state change (drops_at if upcoming, expires_at
 * if live). Returns null for non-drops or expired drops — the UI uses
 * null to mean "no countdown to display."
 */
export function secondsUntilNextChange(
  reward: DropTimingFields,
  now: Date = new Date(),
): number | null {
  const phase = dropPhase(reward, now);
  const t = now.getTime();
  if (phase === "upcoming" && reward.drops_at) {
    return Math.max(0, Math.floor((new Date(reward.drops_at).getTime() - t) / 1000));
  }
  if (phase === "live" && reward.expires_at) {
    return Math.max(0, Math.floor((new Date(reward.expires_at).getTime() - t) / 1000));
  }
  return null;
}

/**
 * True if the drop is in its final hour. Used to switch the countdown
 * UI into urgency state (rose/red, larger font).
 */
export function isInFinalHour(
  reward: DropTimingFields,
  now: Date = new Date(),
): boolean {
  if (dropPhase(reward, now) !== "live" || !reward.expires_at) return false;
  const remaining =
    new Date(reward.expires_at).getTime() - now.getTime();
  return remaining > 0 && remaining <= 60 * 60 * 1000;
}

/** Format seconds as a compact countdown like "2d 3h", "47m 12s", "32s". */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "0s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
