"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { isAiFeatureOn } from "@/lib/ai-features";
import { getAdminContext, getAdminCommunityId, requireWritableBrand, roleAtLeast } from "@/lib/admin";
import { generateBrief } from "@/lib/copilot/generate";

export async function refreshBriefAction() {
  if (!isAiFeatureOn("copilot")) notFound();
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/copilot");
  if (!ctx.isSuperAdmin && !roleAtLeast(ctx.role, "editor")) {
    console.warn("action error:", "Editor role required to refresh the brief.");
    return;
  }

  const communityId = await getAdminCommunityId();
  await requireWritableBrand(ctx, communityId);
  await generateBrief(communityId, { force: true });
  revalidatePath("/admin/copilot");
  return;
}
