"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext, getAdminCommunityId, roleAtLeast } from "@/lib/admin";

const METRICS = ["ledger_count", "member_count", "points_sum"] as const;

async function requireEditor() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/goals");
  if (!ctx.isSuperAdmin && !roleAtLeast(ctx.role, "editor")) {
    redirect("/admin");
  }
  return ctx;
}

export async function createGoalAction(formData: FormData) {
  await requireEditor();
  const communityId = await getAdminCommunityId();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const metric = String(formData.get("metric") ?? "");
  const metricRef = String(formData.get("metric_ref") ?? "").trim() || null;
  const target = parseInt(String(formData.get("target") ?? ""), 10);
  const endsAtRaw = String(formData.get("ends_at") ?? "").trim();

  if (!title) { console.warn("action error:", "Title is required."); return; }
  if (!(METRICS as readonly string[]).includes(metric)) {
    console.warn("action error:", "Invalid metric.");
    return;
  }
  if (!Number.isFinite(target) || target < 1) {
    console.warn("action error:", "Target must be a positive number.");
    return;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("brand_goals").insert({
    community_id: communityId,
    title,
    description,
    metric,
    metric_ref: metricRef,
    target,
    ends_at: endsAtRaw ? new Date(endsAtRaw).toISOString() : null,
  });
  if (error) { console.warn("action error:", error.message); return; }

  revalidatePath("/admin/goals");
  return;
}

export async function toggleGoalActiveAction(formData: FormData) {
  await requireEditor();
  const communityId = await getAdminCommunityId();

  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) { console.warn("action error:", "Missing goal."); return; }

  const admin = createAdminClient();
  const { error } = await admin
    .from("brand_goals")
    .update({ active })
    .eq("id", id)
    .eq("community_id", communityId);
  if (error) { console.warn("action error:", error.message); return; }

  revalidatePath("/admin/goals");
  return;
}
