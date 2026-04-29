import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Brand application — the row backing /for-brands/apply submissions
 * and the /admin/applications review queue.
 */
export type ApplicationStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "rejected"
  | "waitlisted";

export interface BrandApplication {
  id: string;
  status: ApplicationStatus;
  display_name: string;
  slug_suggestion: string | null;
  tagline: string | null;
  bio: string | null;
  hero_image: string | null;
  social: { label: string; href: string }[];
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  category:
    | "restaurant"
    | "retail"
    | "hospitality"
    | "entertainment"
    | "service"
    | "other"
    | null;
  location_count: number | null;
  primary_city: string | null;
  years_in_business: number | null;
  monthly_transactions: number | null;
  loyalty_program_experience: string | null;
  has_street_team: boolean | null;
  expected_launch_date: string | null;
  referral_source: string | null;
  community_pitch: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  approved_slug: string | null;
  approved_brand_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch all applications for the admin review queue, newest first.
 * Uses the admin client so the call bypasses RLS (super-admins can see
 * everything; the page itself is gated by getAdminContext).
 */
export async function listApplications(): Promise<BrandApplication[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as BrandApplication[];
  } catch {
    return [];
  }
}

/**
 * Fetch a single application by id (for a future detail / approve view).
 */
export async function getApplication(
  id: string,
): Promise<BrandApplication | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("applications")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as BrandApplication | null) ?? null;
  } catch {
    return null;
  }
}
