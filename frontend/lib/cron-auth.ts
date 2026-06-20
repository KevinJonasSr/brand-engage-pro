import { NextResponse } from "next/server";

/**
 * Shared cron authentication helper.
 *
 * Returns a NextResponse error if auth fails, or null if the request is
 * authorized. Fails CLOSED: if CRON_SECRET is missing from env (e.g. an
 * accidental redeploy without the var set) we return 503 rather than
 * letting the job run unauthenticated.
 *
 * Usage:
 *   const authErr = verifyCronAuth(request);
 *   if (authErr) return authErr;
 */
export function verifyCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(
      "[cron] CRON_SECRET is not configured — refusing to run unauthenticated",
    );
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  const auth = (request.headers as { get(h: string): string | null }).get(
    "authorization",
  ) ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
