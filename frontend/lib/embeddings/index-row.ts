/**
 * Index a single row into content_embeddings (Brand Engage Pro port).
 *
 * Same shape as Fan Engage's lib/embeddings/index-row.ts with the rename
 * pattern applied:
 *   - community_comments parent-post join column: brand_slug → brand_slug
 *
 * Entry points:
 *   * Inline indexing — server actions on post / comment / etc. create
 *     call `indexRowAsync(...)` fire-and-forget after committing the row.
 *   * Backfill cron — finds rows without an embedding and indexes them.
 *
 * Idempotent via content_hash: if a row's text hasn't changed, the
 * existing embedding is left in place. Errors are caught + logged; the
 * function returns a status string so callers (cron) can summarize.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { embedText, EmbeddingError, pgvectorLiteral } from "./client";
import { contentHash, SOURCES, type SourceTable } from "./sources";

export type IndexResult =
  | { status: "indexed"; tokensEmbedded: number }
  | { status: "skipped_unchanged" }
  | { status: "skipped_empty" }
  | { status: "skipped_no_row" }
  | { status: "error"; error: string };

export async function indexRow(
  table: SourceTable,
  rowId: string,
): Promise<IndexResult> {
  const descriptor = SOURCES[table];
  if (!descriptor) {
    return { status: "error", error: `Unknown source table: ${table}` };
  }

  try {
    const admin = createAdminClient();

    // 1. Fetch the source row.
    let row: Record<string, unknown> | null = null;

    if (table === "community_comments") {
      const { data, error } = await admin
        .from("community_comments")
        .select(
          "id, post_id, body, community_posts!inner(brand_slug, visibility)",
        )
        .eq("id", rowId)
        .maybeSingle();
      if (error) return { status: "error", error: error.message };
      if (!data) return { status: "skipped_no_row" };

      const post = (
        data as unknown as {
          community_posts: { brand_slug: string; visibility: string };
        }
      ).community_posts;
      row = {
        id: data.id,
        post_id: data.post_id,
        body: data.body,
        brand_slug: post?.brand_slug,
        community_id: post?.brand_slug,
        visibility: post?.visibility,
      };
    } else if (table === "communities") {
      const { data, error } = await admin
        .from("communities")
        .select(descriptor.columns)
        .eq("slug", rowId)
        .maybeSingle();
      if (error) return { status: "error", error: error.message };
      if (!data) return { status: "skipped_no_row" };
      row = data as unknown as Record<string, unknown>;
    } else {
      const { data, error } = await admin
        .from(table)
        .select(descriptor.columns)
        .eq("id", rowId)
        .maybeSingle();
      if (error) return { status: "error", error: error.message };
      if (!data) return { status: "skipped_no_row" };
      row = data as unknown as Record<string, unknown>;
    }

    if (!row) return { status: "skipped_no_row" };

    // 2. Build embeddable text + idempotency hash.
    const text = descriptor.buildText(row);
    if (!text || !text.trim()) return { status: "skipped_empty" };
    const hash = contentHash(text);

    const meta = descriptor.extractMeta(row);
    const { data: existing } = await admin
      .from("content_embeddings")
      .select("id, content_hash")
      .eq("source_table", table)
      .eq("source_id", meta.source_id)
      .maybeSingle();

    if (existing && existing.content_hash === hash) {
      return { status: "skipped_unchanged" };
    }

    // 3. Embed.
    const vector = await embedText(text);
    if (!vector) return { status: "skipped_empty" };

    // 4. Upsert.
    const { error: upsertError } = await admin
      .from("content_embeddings")
      .upsert(
        {
          source_table: table,
          source_id: meta.source_id,
          community_id: meta.community_id,
          visibility: meta.visibility,
          embedding: pgvectorLiteral(vector),
          content_hash: hash,
          embedded_at: new Date().toISOString(),
        },
        { onConflict: "source_table,source_id" },
      );
    if (upsertError) return { status: "error", error: upsertError.message };

    return { status: "indexed", tokensEmbedded: text.length };
  } catch (err) {
    const message =
      err instanceof EmbeddingError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(`[embeddings] indexRow ${table}/${rowId} failed:`, message);
    return { status: "error", error: message };
  }
}

/** Fire-and-forget for use inside server actions on row create. */
export function indexRowAsync(table: SourceTable, rowId: string): void {
  void Promise.resolve().then(() => indexRow(table, rowId));
}

