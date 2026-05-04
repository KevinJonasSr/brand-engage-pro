/**
 * Per-brand monthly leaderboard. Scored by community activity, not raw
 * points_ledger totals — points_ledger isn't tied to a brand on the
 * row, and most points come from cross-cutting events (signup bonus,
 * streak bonuses) that wouldn't make sense to attribute to one brand.
 *
 * Activity score weights (V1):
 *   reactions placed:       1 pt
 *   comments posted:        3 pts
 *   RSVPs added:            5 pts
 *   reward redemptions:    10 pts
 *
 * Rationale: comments take more effort than reactions, RSVPs imply
 * intent to show up, redemptions burn points (ultimate signal of
 * engagement). Tunable in the gather module without schema impact.
 */

export interface LeaderboardEntry {
  member_id: string;
  rank: number;            // 1-based; ties resolved by earliest activity timestamp
  display_name: string;
  avatar_url: string | null;
  current_tier: string | null;
  score: number;
  /** Activity breakdown — useful for the "what counts" tooltip on the page. */
  reactions: number;
  comments: number;
  rsvps: number;
  redemptions: number;
}

export interface BrandMonthlyLeaderboard {
  /** ISO date of the first day of the month, in UTC. */
  monthStart: string;
  monthLabel: string;      // e.g., "May 2026"
  brandSlug: string;
  brandName: string;
  /** Top entries, capped (typically 10). */
  top: LeaderboardEntry[];
  /** Viewer's own entry — null when viewer isn't signed in or hasn't engaged. */
  viewerEntry: LeaderboardEntry | null;
  /** Total members with any activity this month — used to render "you're #47 of 312". */
  totalMembers: number;
}
