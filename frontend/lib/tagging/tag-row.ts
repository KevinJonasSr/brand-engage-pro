/**
 * Tag a single community_posts row.
 *
 * Used by:
 *   * Inline trigger from post create actions (fire-and-forget)
 *   * Backfill cron — finds posts where tagged_at is null
 *
 * Idempotent: re-tagging just overwrites tags. The backfill cron
 * filters on tagged_at is null so re-classification only happens
 * deliberately (e.g. when bumping TAG_PROMPT_VERSION).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyTags,
  TagError,
  TAG_MODEL,
  TAG_PROMPT_VERSION,
  type CanonicalTag,
} from "./client";

export type TagRowResult =
  | { status: "tagged"; tags: CanonicalTag[] }
  | { status: "skipped_no_row" }
  | { status: "skipped_empty" }
  | { status: "error"; error: string };

export async function tagRow(postId: string): Promise<TagRowResult> {
  try {
    const admin = createAdminClient();

    const { data: post, error: postErr } = await admin
      .from("community_posts")
      .select("id, brand_slug, kind, title, body, moderation_status")
      .eq("id", postId)
      .maybeSingle();

    if (postErr) return { status: "error", error: postErr.message };
    if (!post) return { status: "skipped_no_row" };

    const body = String(post.body ?? "").trim();
    if (!body) return { status: "skipped_empty" };

    if (post.moderation_status === "auto_hide") {
      return { status: "skipped_empty" };
    }

    const tags = await classifyTags({
      body,
      title: (post.title as string | null) ?? null,
      kind: (post.kind as string) ?? "post",
      community_id: post.brand_slug as string,
    });

    const { error: updateErr } = await admin
      .from("community_posts")
      .update({
        tags,
        tagged_at: new Date().toISOString(),
        tag_model: TAG_MODEL,
        tag_prompt_version: TAG_PROMPT_VERSION,
      })
      .eq("id", postId);

    if (updateErr) return { status: "error", error: updateErr.message };

    return { status: "tagged", tags };
  } catch (err) {
    const message =
      err instanceof TagError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(`[tagging] tagRow ${postId} failed:`, message);
    return { status: "error", error: message };
  }
}

/**
 * Fire-and-forget version for inline server-action use.
 *
 *   tagRowAsync(newPost.id);  // no await — backfill cron is the safety net
 */
export function tagRowAsync(postId: string): void {
  void Promise.resolve().then(() => tagRow(postId));
}
