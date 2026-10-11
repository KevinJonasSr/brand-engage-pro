import { NextResponse } from "next/server";
import { hostStandBrandAccess } from "@/lib/checkin-host-stand";
import {
  checkinBucket,
  checkinPath,
  checkinSecretFromEnv,
  checkinWindowSeconds,
  rotatingRefreshInMs,
  signRotatingCheckinToken,
} from "@/lib/checkin-token";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/checkin-qr?brand=<slug>
 *
 * Current rotating check-in path for the host-stand tablet.
 * The printed poster token is a different value and is not returned here.
 */
export async function GET(req: Request) {
  const brand = new URL(req.url).searchParams.get("brand")?.trim() ?? "";
  if (!brand) {
    return NextResponse.json({ error: "brand is required" }, { status: 400 });
  }

  const access = await hostStandBrandAccess(brand);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const secret = checkinSecretFromEnv();
  if (!secret) {
    return NextResponse.json(
      { error: "Check-in signing is not configured." },
      { status: 503 },
    );
  }

  const windowSeconds = checkinWindowSeconds();
  const now = Date.now();
  const token = signRotatingCheckinToken(access.brand, secret, checkinBucket(now, windowSeconds));

  return NextResponse.json({
    path: checkinPath(access.brand, token),
    windowSeconds,
    refreshInMs: rotatingRefreshInMs(now, windowSeconds),
    requireRotating: await brandRequiresRotatingCheckin(access.brand),
  });
}

/** Missing column or a read error stays off, so posters keep awarding points. */
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
