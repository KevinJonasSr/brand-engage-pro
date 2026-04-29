"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Submit a brand application to public.applications.
 *
 * Public form, no auth — uses the admin client so the insert always
 * lands even when the visitor isn't signed in. RLS allows anon INSERT
 * either way; the admin client just bypasses any future tightening.
 *
 * Validates required fields server-side (the client form also enforces
 * but we treat that as UX, not security).
 */
export async function submitBrandApplicationAction(
  formData: FormData,
): Promise<void> {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : null;
  };
  const getBool = (k: string) => formData.get(k) === "on";
  const getInt = (k: string) => {
    const v = get(k);
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };

  const display_name = get("display_name");
  const contact_name = get("contact_name");
  const contact_email = get("contact_email");

  if (!display_name || !contact_name || !contact_email) {
    redirect("/for-brands/apply?error=missing-required");
  }

  // Build social array from individual platform inputs the form submits.
  const socialPairs: { label: string; href: string }[] = [];
  for (const platform of [
    "Instagram",
    "Facebook",
    "TikTok",
    "YouTube",
    "X",
    "LinkedIn",
  ]) {
    const href = get(`social_${platform.toLowerCase()}`);
    if (href) socialPairs.push({ label: platform, href });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("applications").insert({
    display_name,
    slug_suggestion: get("slug_suggestion"),
    tagline: get("tagline"),
    bio: get("bio"),
    hero_image: get("hero_image"),
    social: socialPairs,
    contact_name,
    contact_email,
    contact_phone: get("contact_phone"),
    category: get("category"),
    location_count: getInt("location_count"),
    primary_city: get("primary_city"),
    years_in_business: getInt("years_in_business"),
    monthly_transactions: getInt("monthly_transactions"),
    loyalty_program_experience: get("loyalty_program_experience"),
    has_street_team: getBool("has_street_team"),
    expected_launch_date: get("expected_launch_date"),
    referral_source: get("referral_source"),
    community_pitch: get("community_pitch"),
  });

  if (error) {
    console.error("submitBrandApplicationAction error:", error);
    redirect("/for-brands/apply?error=submit-failed");
  }

  redirect("/for-brands/apply/thanks");
}
