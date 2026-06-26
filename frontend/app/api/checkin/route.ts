import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordCheckin } from "@/lib/data/checkins";
import { apiRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/checkin
 * Body: { brand_slug: string }
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

  const rl = apiRateLimiter.check(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429 },
    );
  }

  let brandSlug: string;
  try {
    const body = await req.json();
    brandSlug = String(body?.brand_slug ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!brandSlug) {
    return NextResponse.json({ error: "brand_slug is required" }, { status: 400 });
  }

  const result = await recordCheckin(user.id, brandSlug);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    alreadyCheckedIn: result.alreadyCheckedIn,
    pointsAwarded: result.pointsAwarded,
  });
}
