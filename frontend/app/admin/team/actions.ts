"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAdminContext,
  getAdminCommunityId,
  roleAtLeast,
  type AdminRole,
} from "@/lib/admin";

const ASSIGNABLE_ROLES: AdminRole[] = ["admin", "editor", "viewer"];

async function requireOwner() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/team");
  if (!ctx.isSuperAdmin && !roleAtLeast(ctx.role, "owner")) redirect("/admin");
  return ctx;
}

/**
 * Add a team member by email. Only the community owner (or a super-admin)
 * can manage the team, and the invitee must already have a Brand Engage
 * account — they sign up like any member; the owner then grants a role.
 */
export async function addTeamMemberAction(formData: FormData) {
  await requireOwner();
  const communityId = await getAdminCommunityId();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as AdminRole;
  if (!email || !email.includes("@")) {
    console.warn("action error:", "Enter a valid email.");
    return;
  }
  if (!ASSIGNABLE_ROLES.includes(role)) {
    console.warn("action error:", "Invalid role.");
    return;
  }

  const admin = createAdminClient();

  // Resolve the account by email — members.id is the auth user id.
  const { data: member } = await admin
    .from("members")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  const userId = member?.id as string | undefined;
  if (!userId) {
    console.warn(
      "action error:",
      "No account found for that email. Ask them to sign up on the member site first, then add them here.",
    );
    return;
  }

  const { error } = await admin.from("admin_users").upsert(
    { user_id: userId, community_id: communityId, role },
    { onConflict: "user_id,community_id" },
  );
  if (error) { console.warn("action error:", error.message); return; }

  revalidatePath("/admin/team");
  return;
}

export async function removeTeamMemberAction(formData: FormData) {
  const ctx = await requireOwner();
  const communityId = await getAdminCommunityId();

  const userId = String(formData.get("user_id") ?? "");
  if (!userId) { console.warn("action error:", "Missing user."); return; }
  if (userId === ctx.user.id) {
    console.warn("action error:", "You can't remove yourself.");
    return;
  }

  const admin = createAdminClient();

  // Never remove another owner from here — that's a super-admin operation.
  const { data: target } = await admin
    .from("admin_users")
    .select("role")
    .eq("user_id", userId)
    .eq("community_id", communityId)
    .maybeSingle();
  if (target?.role === "owner" && !ctx.isSuperAdmin) {
    console.warn("action error:", "Owners can only be changed by platform staff.");
    return;
  }

  const { error } = await admin
    .from("admin_users")
    .delete()
    .eq("user_id", userId)
    .eq("community_id", communityId);
  if (error) { console.warn("action error:", error.message); return; }

  revalidatePath("/admin/team");
  return;
}
