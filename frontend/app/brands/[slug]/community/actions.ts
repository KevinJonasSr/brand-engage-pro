"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin";

import { findNearestPost } from "@/lib/dedup/check";
type Visibility = "public" | "premium" | "founder-only";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

function normalizeVisibility(raw: FormDataEntryValue | null): Visibility {
  const v = String(raw ?? "public").toLowerCase().trim();
  if (v === "premium" || v === "founder-only") return v;
  return "public";
}

function normalizeUrl(urlRaw: string): string | null {
  const trimmed = urlRaw.trim();
  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export async function createPostAction(formData: FormData) {
  const brandSlug = String(formData.get("brand_slug") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const imageUrlRaw = String(formData.get("image_url") ?? "").trim();
  const videoUrlRaw = String(formData.get("video_url") ?? "").trim();
  const videoPosterUrlRaw = String(formData.get("video_poster_url") ?? "").trim();
  if (!brandSlug || !body) return;
  if (body.length > 2000) return;

  const { supabase, userId } = await requireUser();
  const imageUrl = normalizeUrl(imageUrlRaw);
  const videoUrl = normalizeUrl(videoUrlRaw);
  const videoPosterUrl = normalizeUrl(videoPosterUrlRaw);

  const { data: created } = await supabase
    .from("community_posts")
    .insert({
    brand_slug: brandSlug,
    author_id: userId,
    kind: "post",
    body,
    image_url: imageUrl,
    video_url: videoUrl,
    video_poster_url: videoPosterUrl,
  })
    .select("id")
    .single();

  // AI #20: dedupe — does this post nearly duplicate an existing one?
  if (created) {
    try {
      const dup = await findNearestPost(body, created.id);
      if (dup) {
        await createAdminClient()
          .from("community_posts")
          .update({ duplicate_of: dup.postId })
          .eq("id", created.id);
      }
    } catch (e) {
      console.warn("[ai20] dedupe check failed", e);
    }
  }

  revalidatePath(`/brands/${brandSlug}/community`);
  revalidatePath(`/brands/${brandSlug}`);
}

export async function toggleReactionAction(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const emoji = String(formData.get("emoji") ?? "");
  const brandSlug = String(formData.get("brand_slug") ?? "");
  if (!postId || !emoji || !brandSlug) return;

  const { supabase, userId } = await requireUser();

  // If the member already reacted with this emoji, remove it (toggle off).
  // Otherwise insert.
  const { data: existing } = await supabase
    .from("community_reactions")
    .select("post_id")
    .eq("post_id", postId)
    .eq("member_id", userId)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("community_reactions")
      .delete()
      .eq("post_id", postId)
      .eq("member_id", userId)
      .eq("emoji", emoji);
  } else {
    await supabase.from("community_reactions").insert({
      post_id: postId,
      member_id: userId,
      emoji,
    });
  }

  revalidatePath(`/brands/${brandSlug}/community`);
}

export async function addCommentAction(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const brandSlug = String(formData.get("brand_slug") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!postId || !brandSlug || !body) return;
  if (body.length > 1000) return;

  const { supabase, userId } = await requireUser();

  await supabase.from("community_comments").insert({
    post_id: postId,
    author_id: userId,
    body,
  });

  revalidatePath(`/brands/${brandSlug}/community`);
}

export async function deletePostAction(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const brandSlug = String(formData.get("brand_slug") ?? "");
  if (!postId || !brandSlug) return;

  const { supabase, userId } = await requireUser();
  const adminUser = await getAdminUser();

  // Author can delete own; admin can delete any (via service-role client).
  if (adminUser) {
    const admin = createAdminClient();
    await admin.from("community_posts").delete().eq("id", postId);
  } else {
    await supabase
      .from("community_posts")
      .delete()
      .eq("id", postId)
      .eq("author_id", userId);
  }

  revalidatePath(`/brands/${brandSlug}/community`);
}

// ─── Phase 2a: polls ──────────────────────────────────────────────────────

export async function createPollAction(formData: FormData) {
  // Admin only — regular members can't create polls in Phase 2a.
  const adminUser = await getAdminUser();
  if (!adminUser) return;

  const brandSlug = String(formData.get("brand_slug") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const visibility = normalizeVisibility(formData.get("visibility"));
  const options = formData
    .getAll("option")
    .map((o) => String(o).trim())
    .filter((o) => o.length > 0);
  if (!brandSlug || !body || options.length < 2 || options.length > 6) return;

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("community_posts")
    .insert({
      brand_slug: brandSlug,
      author_id: adminUser.id,
      kind: "poll",
      body,
      visibility,
    })
    .select("id")
    .single();
  if (!post) return;

  await admin.from("community_poll_options").insert(
    options.map((label, i) => ({
      post_id: post.id,
      label,
      sort_order: i,
    })),
  );

  revalidatePath(`/brands/${brandSlug}/community`);
}

export async function votePollAction(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const optionId = String(formData.get("option_id") ?? "");
  const brandSlug = String(formData.get("brand_slug") ?? "");
  if (!postId || !optionId || !brandSlug) return;

  const { supabase, userId } = await requireUser();

  // If member already voted, replace their vote (delete + insert).
  await supabase
    .from("community_poll_votes")
    .delete()
    .eq("post_id", postId)
    .eq("member_id", userId);

  await supabase.from("community_poll_votes").insert({
    post_id: postId,
    member_id: userId,
    option_id: optionId,
  });

  revalidatePath(`/brands/${brandSlug}/community`);
}

// ─── Phase 2a: challenges ─────────────────────────────────────────────────

export async function createChallengeAction(formData: FormData) {
  const adminUser = await getAdminUser();
  if (!adminUser) return;

  const brandSlug = String(formData.get("brand_slug") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const visibility = normalizeVisibility(formData.get("visibility"));
  if (!brandSlug || !body) return;

  const admin = createAdminClient();
  await admin.from("community_posts").insert({
    brand_slug: brandSlug,
    author_id: adminUser.id,
    kind: "challenge",
    title: title || null,
    body,
    visibility,
  });

  revalidatePath(`/brands/${brandSlug}/community`);
}

export async function submitEntryAction(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const brandSlug = String(formData.get("brand_slug") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const imageUrlRaw = String(formData.get("image_url") ?? "").trim();
  if (!postId || !brandSlug || (!body && !imageUrlRaw)) return;

  const { supabase, userId } = await requireUser();
  const imageUrl = normalizeUrl(imageUrlRaw);

  await supabase.from("community_challenge_entries").insert({
    post_id: postId,
    member_id: userId,
    body: body || null,
    image_url: imageUrl,
  });

  revalidatePath(`/brands/${brandSlug}/community`);
}

// ─── Phase 2a: announcements ──────────────────────────────────────────────

export async function createAnnouncementAction(formData: FormData) {
  const adminUser = await getAdminUser();
  if (!adminUser) return;

  const brandSlug = String(formData.get("brand_slug") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const visibility = normalizeVisibility(formData.get("visibility"));
  const imageUrlRaw = String(formData.get("image_url") ?? "").trim();
  const videoUrlRaw = String(formData.get("video_url") ?? "").trim();
  const videoPosterUrlRaw = String(formData.get("video_poster_url") ?? "").trim();
  if (!brandSlug || !body) return;

  const imageUrl = normalizeUrl(imageUrlRaw);
  const videoUrl = normalizeUrl(videoUrlRaw);
  const videoPosterUrl = normalizeUrl(videoPosterUrlRaw);

  const admin = createAdminClient();
  await admin.from("community_posts").insert({
    brand_slug: brandSlug,
    author_id: adminUser.id,
    kind: "announcement",
    title: title || null,
    body,
    pinned: true, // announcements are pinned by default
    visibility,
    image_url: imageUrl,
    video_url: videoUrl,
    video_poster_url: videoPosterUrl,
  });

  revalidatePath(`/brands/${brandSlug}/community`);
}

export async function togglePinAction(formData: FormData) {
  // Admin only — pins a post to the top of an brand's feed.
  const postId = String(formData.get("post_id") ?? "");
  const brandSlug = String(formData.get("brand_slug") ?? "");
  const currentlyPinned = String(formData.get("currently_pinned") ?? "false") === "true";
  if (!postId || !brandSlug) return;

  const adminUser = await getAdminUser();
  if (!adminUser) return;

  const admin = createAdminClient();
  await admin
    .from("community_posts")
    .update({ pinned: !currentlyPinned })
    .eq("id", postId);

  revalidatePath(`/brands/${brandSlug}/community`);
}
