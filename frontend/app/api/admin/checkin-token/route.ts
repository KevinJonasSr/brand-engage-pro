import { NextResponse } from "next/server";
import { canAccessBrand, getAdminContext } from "@/lib/admin";
import {
  ROTATION_SECONDS,
  checkinPath,
  checkinRotationEnabled,
  checkinSecretFromEnv,
  checkinTokenExpiresAt,
  signCheckinToken,
} from "@/lib/checkin-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/checkin-token?brand=<slug>
 *
 * Mints the current signed check-in path for the admin QR display, which
 * re-fetches it as the token rotates (see lib/checkin-token.ts).
 *
 * Admin-gated: a brand admin can only mint for a brand they hold a grant
 * for; super-admins can mint for any brand. Everyone else gets 403/404
 * (404 so the route does not confirm which slugs exist).
 *
 * 200 → { path, token, expiresAt, rotationSeconds, rotation }
 *   - token/expiresAt are null when CHECKIN_SIGNING_SECRET is not set
 *   - rotation is "off" when CHECKIN_TOKEN_ROTATION=off (static token;
 *     expiresAt is then null too)
 */
export async function GET(request: Request) {
  const ctx = await getAdminContext();
  if (!ctx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const brand = (searchParams.get("brand") ?? "").trim().toLowerCase();
  if (!brand || !canAccessBrand(ctx, brand)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const secret = checkinSecretFromEnv();
  const rotation = checkinRotationEnabled() ? "on" : "off";
  const now = Date.now();
  const token = secret ? signCheckinToken(brand, secret, now) : null;

  return NextResponse.json(
    {
      path: checkinPath(brand, token),
      token,
      expiresAt: token && rotation === "on" ? checkinTokenExpiresAt(now) : null,
      rotationSeconds: ROTATION_SECONDS,
      rotation,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
