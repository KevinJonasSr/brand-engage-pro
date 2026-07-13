import { verifyCronAuth } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tagRow } from "@/lib/tagging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/tags-backfill
 *
 * Walks community_posts rows where tagged_at is null and classifies
 * them in small batches. Idempotent — re-tagging just overwrites tags.
 * Schedule via vercel.json every 15 minutes.
 */

const BATCH_SIZE = 30;

interface BackfillSummary {
  totalCandidates: number;
  processed: number;
  byStatus: Record<string, number>;
  errors: Array<{ post_id: string; error: string }>;
  durationMs: number;
}

export async function GET(request: Request) {
  const authErr = verifyCronAuth(request);
  if (authErr) return authErr;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured. Skipping tag backfill until the env var is set in Vercel." },
      { status: 503 },
    );
  }

  const started = Date.now();
  const summary: BackfillSummary = {
    totalCandidates: 0,
    processed: 0,
    byStatus: {},
    errors: [],
    durationMs: 0,
  };

  try {
    const admin = createAdminClient();

    const { data: candidates, error: listErr } = await admin.rpc(
      "list_untagged_posts",
      { p_limit: BATCH_SIZE },
    );
    if (listErr) {
      return NextResponse.json(
        { error: `list_untagged_posts failed: ${listErr.message}` },
        { status: 500 },
      );
    }

    const rows = (candidates ?? []) as Array<{
      post_id: string;
      brand_slug: string;
      body_text: string;
    }>;
    summary.totalCandidates = rows.length;

    for (const row of rows) {
      const result = await tagRow(row.post_id);
      summary.processed += 1;
      summary.byStatus[result.status] = (summary.byStatus[result.status] ?? 0) + 1;
      if (result.status === "error") {
        summary.errors.push({ post_id: row.post_id, error: result.error });
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), partial: summary },
      { status: 500 },
    );
  }

  summary.durationMs = Date.now() - started;
  return NextResponse.json({ ok: true, summary });
}
