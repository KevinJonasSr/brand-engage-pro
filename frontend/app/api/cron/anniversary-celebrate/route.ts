import { NextResponse } from "next/server";
import { processAllAnniversaries } from "@/lib/anniversaries/celebrate";

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
 * Auth: Vercel cron requests come with `authorization: Bearer <CRON_SECRET>`.
 * We accept either the bearer header or `?secret=...` for manual triggering.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await processAllAnniversaries();
  return NextResponse.json({ ok: true, ...summary, ranAt: new Date().toISOString() });
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No CRON_SECRET set → allow (dev/test). Production should always set it.
    console.warn("CRON_SECRET unset — allowing anniversary cron without auth");
    return true;
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}
