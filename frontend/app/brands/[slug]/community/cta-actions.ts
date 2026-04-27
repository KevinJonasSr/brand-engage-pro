"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function completeMemberActionAction(formData: FormData) {
  const actionId = String(formData.get("action_id") ?? "");
  const brandSlug = String(formData.get("brand_slug") ?? "");
  if (!actionId || !brandSlug) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Insert completion (trigger awards points + guards against duplicates via PK)
  await supabase
    .from("member_action_completions")
    .insert({ member_id: user.id, action_id: actionId })
    .select();

  revalidatePath(`/brands/${brandSlug}/community`);
}
