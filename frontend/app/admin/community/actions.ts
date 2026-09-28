"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  adminScope,
  inScope,
  requireAdminContext,
  AdminScopeError,
} from "@/lib/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Throws unless the post exists and belongs to a brand in `scope`. */
async function assertPostInScope(
  supa: AdminClient,
  postId: string,
  scope: string | null,
): Promise<void> {
  const { data: post } = await supa
    .from("community_posts")
    .select("brand_slug")
    .eq("id", postId)
    .maybeSingle();
  if (!post || !inScope(scope, post.brand_slug as string | null)) {
    throw new AdminScopeError();
  }
}

/** Comments and challenge entries carry only post_id, so scope via the post. */
async function assertChildInScope(
  supa: AdminClient,
  table: "community_comments" | "community_challenge_entries",
  id: string,
  scope: string | null,
): Promise<void> {
  if (scope === null) return;
  const { data: row } = await supa
    .from(table)
    .select("post_id")
    .eq("id", id)
    .maybeSingle();
  if (!row?.post_id) throw new AdminScopeError();
  await assertPostInScope(supa, row.post_id as string, scope);
}

export async function adminDeletePostAction(formData: FormData) {
  const scope = adminScope(await requireAdminContext());
  const postId = String(formData.get("post_id") ?? "");
  if (!postId) return;
  const admin = createAdminClient();
  await assertPostInScope(admin, postId, scope);
  await admin.from("community_posts").delete().eq("id", postId);
  revalidatePath("/admin/community");
}

export async function adminTogglePinAction(formData: FormData) {
  const scope = adminScope(await requireAdminContext());
  const postId = String(formData.get("post_id") ?? "");
  const currentlyPinned =
    String(formData.get("currently_pinned") ?? "false") === "true";
  if (!postId) return;
  const admin = createAdminClient();
  await assertPostInScope(admin, postId, scope);
  await admin
    .from("community_posts")
    .update({ pinned: !currentlyPinned })
    .eq("id", postId);
  revalidatePath("/admin/community");
}

export async function adminDeleteCommentAction(formData: FormData) {
  const scope = adminScope(await requireAdminContext());
  const commentId = String(formData.get("comment_id") ?? "");
  if (!commentId) return;
  const admin = createAdminClient();
  await assertChildInScope(admin, "community_comments", commentId, scope);
  await admin.from("community_comments").delete().eq("id", commentId);
  revalidatePath("/admin/community");
}

export async function adminDeleteEntryAction(formData: FormData) {
  const scope = adminScope(await requireAdminContext());
  const entryId = String(formData.get("entry_id") ?? "");
  if (!entryId) return;
  const admin = createAdminClient();
  await assertChildInScope(
    admin,
    "community_challenge_entries",
    entryId,
    scope,
  );
  await admin.from("community_challenge_entries").delete().eq("id", entryId);
  revalidatePath("/admin/community");
  revalidatePath("/admin/challenges");
}

/**
 * Suspend or restore a member.
 * - Brand admins suspend the member in their own brand only, by setting
 *   member_community_memberships.status for that brand. The member must
 *   already belong to the brand; other brands are untouched.
 * - Super-admins set the global members.suspended flag, which applies to
 *   every brand.
 */
export async function adminSuspendMemberAction(formData: FormData) {
  const ctx = await requireAdminContext();
  const scope = adminScope(ctx);
  const memberId = String(formData.get("member_id") ?? "");
  const suspend = String(formData.get("suspend") ?? "true") === "true";
  if (!memberId) return;
  const admin = createAdminClient();

  if (scope === null) {
    await admin
      .from("members")
      .update({ suspended: suspend })
      .eq("id", memberId);
  } else {
    let query = admin
      .from("member_community_memberships")
      .update({ status: suspend ? "suspended" : "active" })
      .eq("member_id", memberId)
      .eq("community_id", scope);
    // Restoring only lifts a suspension; it never promotes a pending member.
    if (!suspend) query = query.eq("status", "suspended");
    const { data: updated } = await query.select("member_id");
    if (suspend && (!updated || updated.length === 0)) {
      throw new AdminScopeError();
    }
  }

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
}
