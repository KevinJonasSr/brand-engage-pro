import { NextResponse } from "next/server";
import { processAllAnniversaries } from "@/lib/anniversaries/celebrate";
import { verifyCronAuth } from "@/lib/cron-auth";

/**
 * GET /api/cron/anniversary-celebrate
 *
 * Daily cron. Walks every member_brand_following row, fires any milestone
 * the member has crossed since the last run, and pushes a celebratory
 * notification + bonus points.
 *
 * Idempotent — the unique (member_id, brand_slug, milestone) on
 * member_anniversary_log means re-runs only fire net-new milestones.
 *
 * Auth: Bearer $CRON_SECRET via verifyCronAuth (fail-closed).
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;
  const summary = await processAllAnniversaries();
  return NextResponse.json({ ok: true, ...summary, ranAt: new Date().toISOString() });
}
