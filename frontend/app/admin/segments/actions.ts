"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext, getAdminUser } from "@/lib/admin";
import {
  evaluateSegment,
  generateSegmentFilter,
  type SegmentFilter,
} from "@/lib/segments";

async function requireAdminBrand(): Promise<{
  brandSlug: string;
  userId: string;
}> {
  const ctx = await getAdminContext();
  const user = await getAdminUser();
  if (!ctx || !user) redirect("/login");
  const brandSlug =
    (ctx as unknown as { brandSlug?: string }).brandSlug ??
    (ctx as unknown as { brand_slug?: string }).brand_slug ??
    (ctx as unknown as { communityId?: string }).communityId ??
    (ctx as unknown as { activeBrandSlug?: string }).activeBrandSlug ??
    "";
  if (!brandSlug) redirect("/admin");
  return { brandSlug, userId: user.id };
}

export async function createSegmentAction(formData: FormData) {
  const { brandSlug, userId } = await requireAdminBrand();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name || !description) return;
  if (name.length > 80 || description.length > 400) return;

  let filter: SegmentFilter | null = null;
  try {
    filter = await generateSegmentFilter(description);
  } catch (e) {
    console.warn("[segments] generate failed:", e);
    return;
  }
  if (!filter) return;

  const matches = await evaluateSegment(filter, brandSlug);
  const memberIds = matches.map((m) => m.member_id);

  const admin = createAdminClient();
  await admin.from("audience_segments").insert({
    brand_slug: brandSlug,
    name,
    description_input: description,
    filter_json: filter,
    member_count: matches.length,
    member_ids: memberIds,
    created_by: userId,
    refreshed_at: new Date().toISOString(),
  });

  revalidatePath("/admin/segments");
}

export async function refreshSegmentAction(formData: FormData) {
  const { brandSlug } = await requireAdminBrand();

  const segmentId = String(formData.get("segment_id") ?? "");
  if (!segmentId) return;

  const admin = createAdminClient();
  const { data: seg } = await admin
    .from("audience_segments")
    .select("filter_json, brand_slug")
    .eq("id", segmentId)
    .eq("brand_slug", brandSlug)
    .maybeSingle();
  if (!seg) return;

  const matches = await evaluateSegment(
    seg.filter_json as SegmentFilter,
    seg.brand_slug as string,
  );
  await admin
    .from("audience_segments")
    .update({
      member_count: matches.length,
      member_ids: matches.map((m) => m.member_id),
      refreshed_at: new Date().toISOString(),
    })
    .eq("id", segmentId);

  revalidatePath("/admin/segments");
}

export async function deleteSegmentAction(formData: FormData) {
  const { brandSlug } = await requireAdminBrand();

  const segmentId = String(formData.get("segment_id") ?? "");
  if (!segmentId) return;

  const admin = createAdminClient();
  await admin
    .from("audience_segments")
    .delete()
    .eq("id", segmentId)
    .eq("brand_slug", brandSlug);

  revalidatePath("/admin/segments");
}
