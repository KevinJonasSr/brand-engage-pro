/**
 * POST /api/ai/alt-text (BEP)
 * Body: { imageUrl, brandSlug?, partialBody? }
 * Returns: { altText }
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAltText } from "@/lib/alt-text/generate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const RATE_WINDOW_MS = 2000;
const lastCallByUser = new Map<string, number>();

interface RequestBody {
  imageUrl?: unknown;
  brandSlug?: unknown;
  partialBody?: unknown;
}

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = userRes.user.id;

  const last = lastCallByUser.get(userId) ?? 0;
  const now = Date.now();
  if (now - last < RATE_WINDOW_MS) {
    return NextResponse.json({ altText: "" });
  }
  lastCallByUser.set(userId, now);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
  const brandSlug =
    typeof body.brandSlug === "string" && body.brandSlug.trim().length > 0
      ? body.brandSlug.trim()
      : undefined;
  const partialBody =
    typeof body.partialBody === "string" ? body.partialBody : "";

  if (!imageUrl) return NextResponse.json({ altText: "" });

  let brandName: string | null = null;
  if (brandSlug) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("brands")
        .select("name")
        .eq("slug", brandSlug)
        .maybeSingle();
      brandName = (data as { name?: string | null } | null)?.name ?? null;
    } catch {
      // best-effort
    }
  }

  const altText = await generateAltText({
    image_url: imageUrl,
    artist_or_brand_name: brandName,
    partial_body: partialBody,
  });

  return NextResponse.json({ altText });
}
