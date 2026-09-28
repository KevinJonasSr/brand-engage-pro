"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminScopeError, adminScope, getAdminContext, inScope } from "@/lib/admin";
import { applyAdminOverride, type ModerateSourceTable } from "@/lib/moderation";

async function requireAdminUserId(): Promise<{ id: string; scope: string | null }> {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");
  return { id: ctx.user.id, scope: adminScope(ctx) };
}

/**
 * Brand admins may only moderate rows in their own brand. Posts carry
 * brand_slug; comments are checked through their parent post.
 */
async function assertRowInScope(
  table: ModerateSourceTable,
  rowId: string,
  scope: string | null,
): Promise<void> {
  if (scope === null) return;
  const supa = createAdminClient();
  let postId = rowId;
  if (table === "community_comments") {
    const { data: comment } = await supa
      .from("community_comments")
      .select("post_id")
      .eq("id", rowId)
      .maybeSingle();
    if (!comment) throw new AdminScopeError();
    postId = comment.post_id as string;
  }
  const { data: post } = await supa
    .from("community_posts")
    .select("brand_slug")
    .eq("id", postId)
    .maybeSingle();
  if (!post || !inScope(scope, post.brand_slug as string | null)) {
    throw new AdminScopeError();
  }
}

function readArgs(formData: FormData): {
  table: ModerateSourceTable | null;
  rowId: string;
} {
  const tableRaw = String(formData.get("table") ?? "");
  const rowId = String(formData.get("row_id") ?? "");
  const table: ModerateSourceTable | null =
    tableRaw === "community_posts" || tableRaw === "community_comments"
      ? (tableRaw as ModerateSourceTable)
      : null;
  return { table, rowId };
}

export async function approveAction(formData: FormData) {
  const { id: adminId, scope } = await requireAdminUserId();
  const { table, rowId } = readArgs(formData);
  if (!table || !rowId) return;
  await assertRowInScope(table, rowId, scope);
  await applyAdminOverride({
    table,
    rowId,
    adminUserId: adminId,
    newStatus: "safe",
    adminNotes: "Approved by admin",
  });
  revalidatePath("/admin/moderation");
}

export async function hideAction(formData: FormData) {
  const { id: adminId, scope } = await requireAdminUserId();
  const { table, rowId } = readArgs(formData);
  if (!table || !rowId) return;
  await assertRowInScope(table, rowId, scope);
  await applyAdminOverride({
    table,
    rowId,
    adminUserId: adminId,
    newStatus: "auto_hide",
    adminNotes: "Hidden by admin",
  });
  revalidatePath("/admin/moderation");
}

export async function restoreToReviewAction(formData: FormData) {
  const { id: adminId, scope } = await requireAdminUserId();
  const { table, rowId } = readArgs(formData);
  if (!table || !rowId) return;
  await assertRowInScope(table, rowId, scope);
  await applyAdminOverride({
    table,
    rowId,
    adminUserId: adminId,
    newStatus: "flag_review",
    adminNotes: "Re-queued by admin",
  });
  revalidatePath("/admin/moderation");
}
