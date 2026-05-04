/**
 * "Your week" recap — the per-member stats card on Member Home.
 *
 * Computed on-the-fly each Member Home render (no cron, no cache table).
 * The queries are bounded (one member, last 7 days) so this is fast in
 * practice. Move to a `weekly_recap` cache table later if Member Home p95
 * starts feeling it.
 */

export interface WeeklyRecap {
  /** ISO timestamp of the start of the rolling 7-day window. */
  windowStart: string;
  /** ISO timestamp of "now" — end of the window. */
  windowEnd: string;
  /** Reactions the member placed on others' posts/comments this week. */
  reactionsGiven: number;
  /** Comments the member posted this week. */
  commentsAdded: number;
  /** RSVPs the member added this week (excludes RSVPs they removed). */
  rsvpsAdded: number;
  /** Sum of POSITIVE points_ledger deltas this week. Refunds netted out. */
  pointsEarned: number;
  /** Slug + display name of the brand the member engaged with most this week. */
  topBrandSlug: string | null;
  topBrandName: string | null;
  /** Current streak from the members table (mirror, no recompute). */
  currentStreakDays: number;
  /**
   * True if there's *any* activity to show. When false the caller
   * should hide the tile entirely — an empty recap is worse UX than no
   * recap at all.
   */
  hasActivity: boolean;
}
