"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Prefs } from "./preferences-form";

const KEYS: Array<keyof Prefs> = [
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

export async function savePreferencesAction(
  prefs: Prefs
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Sanitize: only known keys, cast to bool.
  const payload: Record<string, boolean> = {};
  for (const k of KEYS) {
    payload[k] = !!prefs[k];
  }

  // Try fan_id first (FE), fall back to member_id (BEP).
  let lastError: string | null = null;
  for (const col of ["fan_id", "member_id"]) {
    const row = {
      [col]: user.id,
      ...payload,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(row, { onConflict: col });
    if (!error) {
      revalidatePath("/me/notifications");
      return { ok: true };
    }
    if (
      error.message.includes("does not exist") ||
      error.message.includes("column") ||
      error.code === "42703"
    ) {
      lastError = error.message;
      continue;
    }
    return { error: error.message };
  }
  return { error: lastError ?? "Failed to save preferences." };
}
