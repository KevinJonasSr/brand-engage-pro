import { NextResponse } from "next/server";
import { backfillThreadSummaries } from "@/lib/thread-summary/backfill";
import { verifyCronAuth } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/thread-summary-backfill (BEP)
 *
 * Scheduled every 15 minutes. Capped at 10 posts per tick.
 * Auth: verifyCronAuth (fail-closed).
 */
export async function GET(request: Request) {
  const authErr = verifyCronAuth(request);
  if (authErr) return authErr;

  const started = Date.now();
  const result = await backfillThreadSummaries();

  return NextResponse.json({
    ok: true,
    ...result,
    aiAvailable: Boolean(process.env.ANTHROPIC_API_KEY),
    durationMs: Date.now() - started,
  });
}
