"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin";

async function requireAdmin(): Promise<string> {
  const user = await getAdminUser();
  if (!user) redirect("/login");
  return user.id;
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
