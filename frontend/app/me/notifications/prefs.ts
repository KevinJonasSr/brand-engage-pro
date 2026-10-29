import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Shape of the /me/notifications form, aligned to the
 * notification_preferences columns (verified in prod 2026-09-28).
 */
export type Prefs = {
  // Channel toggles
  push_enabled: boolean;
  sms_enabled: boolean;
  // Notification types
  notify_new_post: boolean;
  notify_event_match: boolean;
  notify_comment_on_my_post: boolean;
  notify_redemption: boolean;
  notify_drops: boolean;
  notify_rsvp_confirmation: boolean;
  notify_predictions: boolean;
  notify_anniversaries: boolean;
  notify_leaderboard: boolean;
  notify_weekly_digest: boolean;
  // Quiet hours, 'HH:MM' or null
  quiet_start: string | null;
  quiet_end: string | null;
};

export type ToggleKey = Exclude<keyof Prefs, "quiet_start" | "quiet_end">;

export const TOGGLE_KEYS: ToggleKey[] = [
  "push_enabled",
  "sms_enabled",
  "notify_new_post",
  "notify_event_match",
  "notify_comment_on_my_post",
  "notify_redemption",
  "notify_drops",
  "notify_rsvp_confirmation",
  "notify_predictions",
  "notify_anniversaries",
  "notify_leaderboard",
  "notify_weekly_digest",
];

export const DEFAULT_PREFS: Prefs = {
  push_enabled: false,
  sms_enabled: false,
  notify_new_post: true,
  notify_event_match: true,
  notify_comment_on_my_post: true,
  notify_redemption: true,
  notify_drops: true,
  notify_rsvp_confirmation: true,
  notify_predictions: true,
  notify_anniversaries: true,
  notify_leaderboard: true,
  notify_weekly_digest: true,
  quiet_start: null,
  quiet_end: null,
};

/** One followed brand as rendered in the Brands section. */
export type BrandPref = {
  slug: string;
  name: string;
  muted: boolean;
};

export type SetBrandMuted = (
  brandSlug: string,
  muted: boolean,
) => Promise<{ ok: true } | { error: string }>;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Mute or unmute one followed brand (member_brand_notification_prefs, 0083).
 *
 * Inline Server Function: this module also exports constants, so it cannot
 * carry a file-level "use server". The page passes it to the client section
 * as a prop. Runs as the signed-in member through RLS, so a member can only
 * ever write their own rows; the follow check keeps the table scoped to
 * brands the member actually follows.
 */
export async function setBrandMuted(
  brandSlug: string,
  muted: boolean,
): Promise<{ ok: true } | { error: string }> {
  "use server";
  const slug = String(brandSlug ?? "").trim();
  if (!SLUG_RE.test(slug)) return { error: "Unknown brand." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: follow } = await supabase
    .from("member_brand_following")
    .select("brand_slug")
    .eq("member_id", user.id)
    .eq("brand_slug", slug)
    .maybeSingle();
  if (!follow) return { error: "You don't follow that brand." };

  const { error } = await supabase
    .from("member_brand_notification_prefs")
    .upsert(
      {
        member_id: user.id,
        brand_slug: slug,
        muted: !!muted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "member_id,brand_slug" },
    );
  if (error) {
    console.error("notifications: failed to set brand mute", error);
    return { error: "Could not update that brand. Please try again." };
  }

  revalidatePath("/me/notifications");
  return { ok: true };
}
