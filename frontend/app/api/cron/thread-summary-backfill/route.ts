import { NextResponse } from "next/server";
import { backfillThreadSummaries } from "@/lib/thread-summary/backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/thread-summary-backfill (BEP)
 *
 * Scheduled every 15 minutes. Capped at 10 posts per tick.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const started = Date.now();
  const result = await backfillThreadSummaries();

  return NextResponse.json({
    ok: true,
    ...result,
    aiAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
    durationMs: Date.now() - started,
  });
}
