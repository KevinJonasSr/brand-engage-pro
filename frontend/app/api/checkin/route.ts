import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordCheckin } from "@/lib/data/checkins";
import { apiRateLimiter } from "@/lib/rate-limit";
import {
  CHECKIN_TOKEN_REQUIRED_MESSAGE,
  HOST_STAND_REQUIRED_MESSAGE,
  checkinAccessDecision,
  checkinSecretFromEnv,
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
 * Brands with require_rotating_checkin still accept the printed static
 * token, but that scan does not write a check-in or award points.
 *
 * Requires a valid member session. Records a visit check-in and awards
 * CHECKIN_POINTS points (idempotent — one per member per brand per day).
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

  const decision = checkinAccessDecision(
    brandSlug,
    token,
    checkinSecretFromEnv(),
    await brandRequiresRotatingCheckin(brandSlug),
  );
  if (!decision.allow) {
    return NextResponse.json({ error: CHECKIN_TOKEN_REQUIRED_MESSAGE }, { status: 403 });
  }
  if (decision.reason === "unconfigured" && !warnedUnconfigured) {
    warnedUnconfigured = true;
    console.warn("[checkin] CHECKIN_SIGNING_SECRET is not set; check-ins are not verified.");
  }

  // Poster scan while rotating check-in is on: sign-up already happened
  // (the member is signed in). Do not insert a check-in, or the one-per-day
  // index would block the host-stand scan that actually awards points.
  if (!decision.awardPoints) {
    return NextResponse.json({
      alreadyCheckedIn: false,
      pointsAwarded: 0,
      hostStandRequired: true,
      message: HOST_STAND_REQUIRED_MESSAGE,
    });
  }

  const result = await recordCheckin(user.id, brandSlug);

  if (!result.ok) {
    if (result.unknownBrand) {
      return NextResponse.json({ error: "Unknown brand" }, { status: 404 });
    }
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    alreadyCheckedIn: result.alreadyCheckedIn,
    pointsAwarded: result.pointsAwarded,
  });
}

/**
 * True only when the column is present and set. A missing column (code
 * deployed before the migration) or a read error stays false so printed
 * posters keep awarding points.
 */
async function brandRequiresRotatingCheckin(slug: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("brands")
      .select("require_rotating_checkin")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return false;
    return data.require_rotating_checkin === true;
  } catch {
    return false;
  }
}
