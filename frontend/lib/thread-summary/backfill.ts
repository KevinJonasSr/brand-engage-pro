/**
 * AI #14: Long-thread summary backfill (BEP).
 * Verbatim from FE — schema-agnostic, uses the find_threads_needing_summary
 * RPC and updates the community_posts row with the summary result.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeThread } from "./summarize";

const MIN_COMMENTS = 8;
const REFRESH_DELTA = 5;
const BATCH_LIMIT = 10;

export type BackfillResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: Array<{ post_id: string; error: string }>;
};

export async function backfillThreadSummaries(): Promise<BackfillResult> {
  const admin = createAdminClient();
  const result: BackfillResult = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  const { data, error } = await admin.rpc("find_threads_needing_summary", {
    p_min_comments: MIN_COMMENTS,
    p_refresh_delta: REFRESH_DELTA,
    p_limit: BATCH_LIMIT,
  });
  if (error) {
    result.errors.push({ post_id: "(rpc)", error: error.message });
    return result;
  }

  const candidates = (data ?? []) as Array<{
    post_id: string;
    comment_count: number;
  }>;
  result.attempted = candidates.length;

  for (const c of candidates) {
    try {
      const summary = await summarizeThread(c.post_id);
      if (!summary) {
        result.failed += 1;
        continue;
      }
      const { error: updErr } = await admin
        .from("community_posts")
        .update({
          thread_summary: summary.summary,
          thread_summary_count: summary.commentCount,
          thread_summary_at: new Date().toISOString(),
        })
        .eq("id", c.post_id);
      if (updErr) {
        result.failed += 1;
        if (result.errors.length < 5) {
          result.errors.push({ post_id: c.post_id, error: updErr.message });
        }
      } else {
        result.succeeded += 1;
      }
    } catch (e) {
      result.failed += 1;
      if (result.errors.length < 5) {
        result.errors.push({
          post_id: c.post_id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return result;
}
