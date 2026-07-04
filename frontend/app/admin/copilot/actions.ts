"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContext, getAdminCommunityId, roleAtLeast } from "@/lib/admin";
import { generateBrief } from "@/lib/copilot/generate";

export async function refreshBriefAction() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/copilot");
  if (!ctx.isSuperAdmin && !roleAtLeast(ctx.role, "editor")) {
    console.warn("action error:", "Editor role required to refresh the brief.");
    return;
  }

  const communityId = await getAdminCommunityId();
  await generateBrief(communityId, { force: true });
  revalidatePath("/admin/copilot");
  return;
}
