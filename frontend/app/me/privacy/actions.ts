"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Update the signed-in member's privacy preferences.
 *
 * Currently exposes one toggle: public_profile_enabled. This controls whether
 * /members/<profile_slug> is reachable. When false, the route 404s — members
 * can opt out of being publicly listed without leaking that the slug exists.
 *
 * The actual public profile data layer (lib/data/member-profile.ts) NEVER
 * exposes email, phone, last login, stripe ids, or moderation state — that's
 * a hard architectural guarantee, not a per-user setting. So this single
 * toggle is the full privacy surface for now. Per-field toggles can be added
 * later by extending this action and the schema.
 */
export async function savePrivacyAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const publicProfileEnabled =
    String(formData.get("public_profile_enabled") ?? "false") === "true";

  await supabase
    .from("members")
    .update({ public_profile_enabled: publicProfileEnabled })
    .eq("id", user.id);

  revalidatePath("/me/privacy");
  revalidatePath("/me");
}
