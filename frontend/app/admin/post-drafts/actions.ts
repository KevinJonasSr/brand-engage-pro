"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext, getAdminUser } from "@/lib/admin";
import {
  generateBrandPostDraft,
  type DraftContext,
} from "@/lib/post-drafts";

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

export async function generateAction() {
  const { brandSlug } = await requireAdminBrand();
  const admin = createAdminClient();

  const nowIso = new Date().toISOString();
  const [eventsRes, postsRes, commentsRes, brandRes] = await Promise.all([
    admin
      .from("brand_events")
      .select("title, event_starts_at, detail")
      .eq("brand_slug", brandSlug)
      .gte("event_starts_at", nowIso)
      .order("event_starts_at", { ascending: true })
      .limit(5),
    admin
      .from("community_posts")
      .select("kind, title, body")
      .eq("brand_slug", brandSlug)
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("community_comments")
      .select("body, post_id, community_posts!inner(brand_slug)")
      .eq("community_posts.brand_slug", brandSlug)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("brands")
      .select("name")
      .eq("slug", brandSlug)
      .maybeSingle(),
  ]);

  const upcoming_events = (eventsRes.data ?? []).map((e) => ({
    title: (e.title as string) ?? "Untitled event",
    event_starts_at: (e.event_starts_at as string | null) ?? null,
    detail: (e.detail as string | null) ?? null,
  }));

  const recent_admin_posts = (postsRes.data ?? []).map((p) => ({
    kind: (p.kind as string) ?? "post",
    title: (p.title as string | null) ?? null,
    body: (p.body as string) ?? "",
  }));

  const recent_member_comments_sample = (commentsRes.data ?? [])
    .map((c) => ({ body: (c.body as string) ?? "" }))
    .filter((c) => c.body.trim().length > 0)
    .slice(0, 12);

  const brandName =
    (brandRes.data as { name?: string | null } | null)?.name ?? null;

  const context: DraftContext = {
    brand_slug: brandSlug,
    brand_name: brandName,
    upcoming_events,
    recent_admin_posts,
    recent_member_comments_sample,
  };

  let draft;
  try {
    draft = await generateBrandPostDraft(context);
  } catch (e) {
    console.warn("[post-drafts] generation failed:", e);
    return;
  }
  if (!draft) return;

  await admin.from("brand_post_drafts").insert({
    brand_slug: brandSlug,
    kind: draft.kind,
    suggested_title: draft.title,
    suggested_body: draft.body,
    context_summary: draft.context_summary,
    inputs_json: context,
    generated_by: "ai",
  });

  revalidatePath("/admin/post-drafts");
}

export async function publishAction(formData: FormData) {
  const { brandSlug, userId } = await requireAdminBrand();
  const draftId = String(formData.get("draft_id") ?? "");
  if (!draftId) return;

  const editedTitle = String(formData.get("edited_title") ?? "").trim();
  const editedBody = String(formData.get("edited_body") ?? "").trim();

  const admin = createAdminClient();

  const { data: draft } = await admin
    .from("brand_post_drafts")
    .select("kind, suggested_title, suggested_body, brand_slug, status")
    .eq("id", draftId)
    .eq("brand_slug", brandSlug)
    .maybeSingle();
  if (!draft || draft.status !== "pending") return;

  const finalTitle = editedTitle || (draft.suggested_title as string | null) || null;
  const finalBody = editedBody || (draft.suggested_body as string);
  if (!finalBody.trim()) return;

  const { data: post } = await admin
    .from("community_posts")
    .insert({
      brand_slug: brandSlug,
      author_id: userId,
      kind: draft.kind,
      title: finalTitle,
      body: finalBody,
      visibility: "public",
    })
    .select("id")
    .single();
  if (!post) return;

  await admin
    .from("brand_post_drafts")
    .update({
      status: "published",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      published_post_id: post.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);

  revalidatePath("/admin/post-drafts");
  revalidatePath(`/brands/${brandSlug}/community`);
}

export async function discardAction(formData: FormData) {
  const { brandSlug, userId } = await requireAdminBrand();
  const draftId = String(formData.get("draft_id") ?? "");
  if (!draftId) return;

  const admin = createAdminClient();
  await admin
    .from("brand_post_drafts")
    .update({
      status: "discarded",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("brand_slug", brandSlug);

  revalidatePath("/admin/post-drafts");
}
