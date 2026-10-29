import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCheckinProgress,
  recordCheckin,
  type CheckinProgress,
} from "@/lib/data/checkins";
import { apiRateLimiter } from "@/lib/rate-limit";
import {
  CHECKIN_TOKEN_REQUIRED_MESSAGE,
  checkinSecretFromEnv,
  checkinTokenDecision,
} from "@/lib/checkin-token";

export const dynamic = "force-dynamic";

let warnedUnconfigured = false;

/**
 * POST /api/checkin
 * Body: { brand_slug: string, token?: string }
 *
 * `token` is the HMAC from the in-store QR code (see lib/checkin-token.ts).
 * When CHECKIN_SIGNING_SECRET is set it is required; when it is not set the
 * check-in is allowed and a one-line warning is logged (rollout safety).
 *
 * Requires a valid member session. Records a visit check-in and awards
 * CHECKIN_POINTS points (idempotent — one per member per brand per day).
 *
 * 200 → { alreadyCheckedIn, pointsAwarded, progress: CheckinProgress | null }
 * where progress carries spendablePoints, visitCount, streakDays, stampCard
 * ({ stampsEarned, stampsRequired, rewardTitle, visitsRemaining, justCompleted }
 * or null) and nextTier ({ name, pointsToNext } or null).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await apiRateLimiter.check(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429 },
    );
  }

  let brandSlug: string;
  let token: string;
  try {
    const body = await req.json();
    brandSlug = String(body?.brand_slug ?? "").trim();
    token = typeof body?.token === "string" ? body.token.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!brandSlug) {
    return NextResponse.json({ error: "brand_slug is required" }, { status: 400 });
  }

  const decision = checkinTokenDecision(brandSlug, token, checkinSecretFromEnv());
  if (!decision.allow) {
    return NextResponse.json({ error: CHECKIN_TOKEN_REQUIRED_MESSAGE }, { status: 403 });
  }
  if (decision.reason === "unconfigured" && !warnedUnconfigured) {
    warnedUnconfigured = true;
    console.warn("[checkin] CHECKIN_SIGNING_SECRET is not set; check-ins are not verified.");
  }

  const result = await recordCheckin(user.id, brandSlug);

  if (!result.ok) {
    if (result.unknownBrand) {
      return NextResponse.json({ error: "Unknown brand" }, { status: 404 });
    }
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Progress snapshot (balance, visits, streak, stamp card, next tier) so the
  // landing page can show the moment. Best-effort: never fails the check-in.
  const progress: CheckinProgress | null = await getCheckinProgress(
    user.id,
    brandSlug,
  ).catch((err: unknown) => {
    console.warn("[checkin] progress lookup failed", err);
    return null;
  });

  return NextResponse.json({
    alreadyCheckedIn: result.alreadyCheckedIn,
    pointsAwarded: result.pointsAwarded,
    progress,
  });
}
