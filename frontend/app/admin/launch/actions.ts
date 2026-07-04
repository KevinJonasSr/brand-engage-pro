"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";

async function requireSuperAdmin() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/launch");
  if (!ctx.isSuperAdmin) redirect("/admin");
  return ctx;
}

/** Create the community row (inactive) so setup can start. */
export async function initializeCommunityAction(formData: FormData) {
  await requireSuperAdmin();

  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!slug || !displayName) {
    console.warn("action error:", "Slug and display name are required.");
    return;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("communities").upsert(
    {
      slug,
      display_name: displayName,
      type: "brand",
      subdomain: slug.replace(/-/g, ""),
      active: false,
      sort_order: 99,
    },
    { onConflict: "slug" },
  );
  if (error) { console.warn("action error:", error.message); return; }

  revalidatePath("/admin/launch");
  return;
}

/** Grant the owner role by email — the account must already exist. */
export async function assignOwnerAction(formData: FormData) {
  await requireSuperAdmin();

  const communityId = String(formData.get("community_id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!communityId || !email) {
    console.warn("action error:", "Community and email are required.");
    return;
  }

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (!member?.id) {
    console.warn(
      "action error:",
      "No account for that email — they need a Brand Engage account first.",
    );
    return;
  }

  const { error } = await admin.from("admin_users").upsert(
    { user_id: member.id, community_id: communityId, role: "owner" },
    { onConflict: "user_id,community_id" },
  );
  if (error) { console.warn("action error:", error.message); return; }

  revalidatePath("/admin/launch");
  return;
}

/** Flip the community live (or back to hidden). */
export async function setCommunityActiveAction(formData: FormData) {
  await requireSuperAdmin();

  const communityId = String(formData.get("community_id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!communityId) { console.warn("action error:", "Missing community."); return; }

  const admin = createAdminClient();
  const { error } = await admin
    .from("communities")
    .update({ active })
    .eq("slug", communityId);
  if (error) { console.warn("action error:", error.message); return; }

  revalidatePath("/admin/launch");
  return;
}
