"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleFollowAction(formData: FormData) {
  const brandSlug = String(formData.get("brand_slug") ?? "").trim();
  const wantFollow = String(formData.get("follow") ?? "true") === "true";
  if (!brandSlug) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (wantFollow) {
    await supabase
      .from("member_brand_following")
      .upsert(
        { member_id: user.id, brand_slug: brandSlug },
        { onConflict: "member_id,brand_slug" },
      );
  } else {
    await supabase
      .from("member_brand_following")
      .delete()
      .eq("member_id", user.id)
      .eq("brand_slug", brandSlug);
  }

  revalidatePath(`/brands/${brandSlug}`);
  revalidatePath(`/brands/${brandSlug}/community`);
}
