/**
 * Member-brand anniversary milestones.
 *
 * Tenure starts from member_brand_following.followed_at. We celebrate at
 * 1mo, 3mo, 6mo, 1yr, 2yr, 3yr, 5yr — sliding-scale points award reflects
 * how rare each milestone is.
 */

export type AnniversaryMilestone =
  | "1_month"
  | "3_months"
  | "6_months"
  | "1_year"
  | "2_years"
  | "3_years"
  | "5_years";

export interface MilestoneConfig {
  key: AnniversaryMilestone;
  /** Tenure in days at which this milestone is reached. */
  daysRequired: number;
  /** Points awarded when celebrated. */
  points: number;
  /** Member-facing label (used in push body and member_anniversary_log.metadata). */
  label: string;
}

/**
 * Ordered ascending by daysRequired. The cron processes them in order so
 * a member who is past multiple milestones gets celebrated in sequence
 * (each insertion is unique-on-conflict skipped if already present).
 */
export const MILESTONES: MilestoneConfig[] = [
  { key: "1_month",  daysRequired:   30, points:   25, label: "one month" },
  { key: "3_months", daysRequired:   90, points:   50, label: "three months" },
  { key: "6_months", daysRequired:  180, points:  100, label: "six months" },
  { key: "1_year",   daysRequired:  365, points:  250, label: "one year" },
  { key: "2_years",  daysRequired:  730, points:  500, label: "two years" },
  { key: "3_years",  daysRequired: 1095, points:  750, label: "three years" },
  { key: "5_years",  daysRequired: 1825, points: 1500, label: "five years" },
];

export interface FollowingRow {
  member_id: string;
  brand_slug: string;
  followed_at: string;
}

export interface AnniversaryEvent {
  member_id: string;
  brand_slug: string;
  brand_name: string;
  milestone: AnniversaryMilestone;
  points: number;
  label: string;
}
