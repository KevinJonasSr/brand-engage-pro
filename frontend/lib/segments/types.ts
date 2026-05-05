/**
 * AI #16: Auto-segmentation — public type surface (BEP).
 *
 * Field names use member_id / member_count to match BEP's vocabulary.
 */

export type MemberTier = "bronze" | "silver" | "gold" | "platinum";
export const MEMBER_TIERS: readonly MemberTier[] = ["bronze", "silver", "gold", "platinum"];

export type SegmentFilter = {
  tiers?: MemberTier[];
  total_points_min?: number;
  total_points_max?: number;
  city_contains?: string;
  interest_contains?: string;
  sms_opted_in?: boolean;
  email_opted_in?: boolean;
  signup_within_days?: number;
  signup_older_than_days?: number;
  min_posts_last_30d?: number;
};

export type SegmentMatch = {
  member_id: string;
  email: string;
  first_name: string | null;
  city: string | null;
  current_tier: MemberTier;
  total_points: number;
  posts_30d: number;
};

export type SegmentRow = {
  id: string;
  brand_slug: string;
  name: string;
  description_input: string | null;
  filter_json: SegmentFilter;
  member_count: number;
  member_ids: string[];
  created_at: string;
  refreshed_at: string;
};
