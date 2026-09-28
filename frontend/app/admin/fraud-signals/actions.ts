"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext, requireSuperAdmin } from "@/lib/admin";

/**
 * fraud_signals has no brand column, so a brand admin cannot be limited to
 * their own brand's signals. Review stays with super-admins (owners).
 */
async function requireAdmin(): Promise<string> {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");
  requireSuperAdmin(ctx);
  return ctx.user.id;
}

async function setStatus(formData: FormData, status: "dismissed" | "confirmed") {
  const userId = await requireAdmin();
  const id = String(formData.get("signal_id") ?? "");
  if (!id) return;
  const admin = createAdminClient();
  await admin
    .from("fraud_signals")
    .update({
      status,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");
  revalidatePath("/admin/fraud-signals");
}

export async function dismissFraudSignalAction(formData: FormData) {
  await setStatus(formData, "dismissed");
}

export async function confirmFraudSignalAction(formData: FormData) {
  await setStatus(formData, "confirmed");
}
