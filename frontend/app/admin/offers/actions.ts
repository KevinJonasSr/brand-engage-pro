"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  adminScope,
  requireAdminContext,
  resolveWriteBrand,
} from "@/lib/admin";
import type { OfferCategory, TierSlug } from "@/lib/data/types";

const CATEGORIES: OfferCategory[] = ["merch", "experience", "collectible", "digital", "ticket"];
const TIERS: TierSlug[] = ["bronze", "silver", "gold", "platinum"];

export async function createOfferAction(formData: FormData) {
  const ctx = await requireAdminContext();
  // Every offer belongs to a brand. Brand admins always write to their own
  // brand; super-admins must pick one. Never fall back to the DB default.
  const communityId = resolveWriteBrand(
    ctx,
    String(formData.get("community_id") ?? ""),
  );

  const title = String(formData.get("title") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "merch");
  const minTierRaw = String(formData.get("min_tier") ?? "bronze");
  const pricePointsRaw = formData.get("price_points");
  const inventoryRaw = formData.get("inventory");
  const imageUrl = String(formData.get("image_url") ?? "").trim();

  if (!title || !slug) return;

  const category = (CATEGORIES.includes(categoryRaw as OfferCategory)
    ? categoryRaw
    : "merch") as OfferCategory;
  const min_tier = (TIERS.includes(minTierRaw as TierSlug)
    ? minTierRaw
    : "bronze") as TierSlug;

  const admin = createAdminClient();
  await admin.from("offers").insert({
    community_id: communityId,
    title,
    slug,
    description: description || null,
    category,
    min_tier,
    price_points: pricePointsRaw ? Number(pricePointsRaw) : null,
    inventory: inventoryRaw ? Number(inventoryRaw) : null,
    image_url: imageUrl || null,
    active: true,
  });

  revalidatePath("/admin/offers");
  revalidatePath("/marketplace");
  revalidatePath("/");
}

/**
 * Update the image_url on an existing offer. Called by the inline
 * OfferImageEditor on each row in /admin/offers — the form auto-submits
 * once the upload completes.
 */
export async function updateOfferImageAction(formData: FormData) {
  const scope = adminScope(await requireAdminContext());
  const id = String(formData.get("id") ?? "");
  const imageUrl = String(formData.get("image_url") ?? "").trim();
  if (!id) return;

  const admin = createAdminClient();
  let query = admin
    .from("offers")
    .update({ image_url: imageUrl || null })
    .eq("id", id);
  if (scope) query = query.eq("community_id", scope);
  await query;

  revalidatePath("/admin/offers");
  revalidatePath("/marketplace");
  revalidatePath("/");
}

export async function toggleOfferActiveAction(formData: FormData) {
  const scope = adminScope(await requireAdminContext());
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "true") === "true";
  if (!id) return;

  const admin = createAdminClient();
  let query = admin.from("offers").update({ active }).eq("id", id);
  if (scope) query = query.eq("community_id", scope);
  await query;

  revalidatePath("/admin/offers");
  revalidatePath("/marketplace");
  revalidatePath("/");
}
