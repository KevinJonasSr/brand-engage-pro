"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { applyAdminOverride, type ModerateSourceTable } from "@/lib/moderation";

async function requireAdminUserId(): Promise<string> {
  const u = await getAdminUser();
  if (!u) redirect("/login");
  return u.id;
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
  const adminId = await requireAdminUserId();
  const { table, rowId } = readArgs(formData);
  if (!table || !rowId) return;
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
  const adminId = await requireAdminUserId();
  const { table, rowId } = readArgs(formData);
  if (!table || !rowId) return;
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
  const adminId = await requireAdminUserId();
  const { table, rowId } = readArgs(formData);
  if (!table || !rowId) return;
  await applyAdminOverride({
    table,
    rowId,
    adminUserId: adminId,
    newStatus: "flag_review",
    adminNotes: "Re-queued by admin",
  });
  revalidatePath("/admin/moderation");
}
