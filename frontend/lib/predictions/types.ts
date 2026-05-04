/**
 * BEP Predictions — three subtypes:
 *   - 'multi'   — multiple choice (uses community_poll_options)
 *   - 'numeric' — guess a number  (e.g. "biscuits sold by 8pm")
 *   - 'date'    — guess a date    (e.g. "when does new menu drop")
 *
 * Lifecycle: open → closed → resolved.
 *   open      = closes_at > now AND resolved_at IS NULL
 *   closed    = closes_at <= now AND resolved_at IS NULL  (awaiting admin)
 *   resolved  = resolved_at IS NOT NULL                   (winners awarded)
 *
 * Scoring strategies (numeric/date only):
 *   exact            — must equal correct_value (within tolerance for numeric)
 *   closest          — winners are members whose guess is closest by abs(distance)
 *   closest_no_over  — winners are closest WITHOUT going over (Price-Is-Right)
 *
 * Multi is always exact-match: vote.option_id == correct_option_id.
 */

export type PredictionType = "multi" | "numeric" | "date";
export type AwardStrategy = "exact" | "closest" | "closest_no_over";
export type PredictionPhase = "open" | "closed" | "resolved";
export type PredictionVisibility = "public" | "premium" | "founder-only";

export interface PredictionPostFields {
  prediction_type: PredictionType | null;
  prediction_closes_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  correct_option_id: string | null;
  correct_numeric_value: number | null;
  correct_date_value: string | null;
  numeric_unit: string | null;
  numeric_tolerance: number | null;
  points_for_correct: number | null;
  allow_vote_changes: boolean;
  show_live_tally: boolean;
  award_strategy: AwardStrategy;
}

export interface PredictionPost extends PredictionPostFields {
  id: string;
  brand_slug: string;
  community_id: string;
  author_id: string;
  title: string;
  body: string | null;
  visibility: PredictionVisibility;
  kind: "prediction";
  created_at: string;
}

export interface PollOption {
  id: string;
  post_id: string;
  label: string;
  sort_order: number;
}

export interface PollVote {
  id: string;
  post_id: string;
  member_id: string;
  option_id: string | null;
  numeric_value: number | null;
  date_value: string | null;
  created_at: string;
}

/** What the API returns for the live tally on an open prediction. */
export interface PredictionTally {
  total_votes: number;
  /** For 'multi' — counts per option_id. Empty for other types. */
  by_option: { option_id: string; label: string; count: number; pct: number }[];
  /** For 'numeric' — distribution buckets. */
  numeric_summary: { min: number; max: number; mean: number; median: number } | null;
  /** For 'date' — frequency by date. */
  date_buckets: { date: string; count: number }[];
}

/** Phase computation. */
export function predictionPhase(
  fields: Pick<PredictionPostFields, "prediction_closes_at" | "resolved_at">,
  now: Date = new Date(),
): PredictionPhase {
  if (fields.resolved_at) return "resolved";
  if (
    fields.prediction_closes_at &&
    new Date(fields.prediction_closes_at).getTime() <= now.getTime()
  ) {
    return "closed";
  }
  return "open";
}

/** Seconds until close — null when no close-time or already past. */
export function secondsUntilPredictionClose(
  fields: Pick<PredictionPostFields, "prediction_closes_at">,
  now: Date = new Date(),
): number | null {
  if (!fields.prediction_closes_at) return null;
  const ms = new Date(fields.prediction_closes_at).getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / 1000);
}

/** Compact countdown formatter: "2d 3h", "47m 12s", "32s". */
export function formatPredictionCountdown(seconds: number): string {
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

/** AI-suggested prediction returned by the suggester API. */
export interface PredictionSuggestion {
  prediction_type: PredictionType;
  title: string;
  body: string | null;
  options?: string[];                 // multi
  numeric_unit?: string;              // numeric
  numeric_correct_hint?: number | null; // numeric (admin-editable)
  date_correct_hint?: string | null;  // date    (admin-editable)
  suggested_close_in_hours: number;
  suggested_points: number;
  suggested_strategy?: AwardStrategy;
}
