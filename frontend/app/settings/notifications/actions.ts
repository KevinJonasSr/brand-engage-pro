"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setPreferences } from "@/lib/notifications/preferences";
import type { NotificationPreferences } from "@/lib/notifications/types";

const TIER_RANK: Record<string, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
  founder: 3,
};

/**
 * Persist a member's notification preferences. Server-side enforces the SMS
 * tier gate — even if the client sends sms_enabled=true for a Bronze
 * member, we silently coerce it back to false.
 */
export async function saveNotificationPreferencesAction(
  patch: Partial<NotificationPreferences>,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Enforce SMS tier gate
  if (patch.sms_enabled === true) {
    const { data: member } = await supabase
      .from("members")
      .select("current_tier")
      .eq("id", user.id)
      .maybeSingle();
    const rank = TIER_RANK[(member?.current_tier as string) ?? "bronze"] ?? 0;
    if (rank < TIER_RANK.gold) {
      patch = { ...patch, sms_enabled: false };
    }
  }

  await setPreferences(user.id, patch);
  revalidatePath("/settings/notifications");
}
