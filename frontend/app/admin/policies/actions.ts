"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminContext, requireSuperAdmin } from "@/lib/admin";

/**
 * Policy pages (terms, privacy, cookie policy) are platform-wide legal text,
 * so only super-admins (owners) may edit them. Note: there is no history
 * table yet; updated_by records only the last editor.
 */
async function requireAdmin() {
  const ctx = await requireAdminContext();
  requireSuperAdmin(ctx);
  return ctx.user;
}

export async function updatePolicyAction(formData: FormData) {
  const admin = await requireAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) return;

  const title = String(formData.get("title") ?? "").trim();
  const contentMd = String(formData.get("content_md") ?? "");
  const effectiveDateRaw = String(formData.get("effective_date") ?? "").trim();
  const isDraft = String(formData.get("is_draft") ?? "false") === "true";

  const supa = createAdminClient();
  await supa
    .from("policy_pages")
    .update({
      title,
      content_md: contentMd,
      effective_date: effectiveDateRaw || null,
      is_draft: isDraft,
      updated_by: admin.id,
    })
    .eq("slug", slug);

  revalidatePath("/admin/policies");
  revalidatePath(`/admin/policies/${slug}`);
  revalidatePath(`/${slug === "cookie_policy" ? "cookie-policy" : slug}`);
}
