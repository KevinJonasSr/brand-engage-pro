/**
 * POST /api/ai/suggest-tags (BEP)
 *
 * Body: { partialBody: string, brandSlug?: string }
 * Returns: { tags: string[] }
 *
 * Auth: requires logged-in member (auth.getUser via server client).
 * Rate limit: 1 call / 1.5s per user, in-memory.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { suggestTagsFromBody } from "@/lib/tagging/suggest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const RATE_WINDOW_MS = 1500;
const lastCallByUser = new Map<string, number>();

interface RequestBody {
  partialBody?: unknown;
  brandSlug?: unknown;
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
    return NextResponse.json({ tags: [] }, { status: 200 });
  }
  lastCallByUser.set(userId, now);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const partialBody = typeof body.partialBody === "string" ? body.partialBody : "";
  const brandSlug =
    typeof body.brandSlug === "string" && body.brandSlug.trim().length > 0
      ? body.brandSlug.trim()
      : undefined;

  if (partialBody.trim().length < 12) {
    return NextResponse.json({ tags: [] });
  }

  // Pull top existing tags for this brand as taxonomy nudge
  let existing_tags: string[] | undefined;
  if (brandSlug) {
    try {
      const admin = createAdminClient();
      const { data: tagRows } = await admin
        .from("community_posts")
        .select("tags")
        .eq("brand_slug", brandSlug)
        .not("tags", "is", null)
        .limit(200);
      if (tagRows && tagRows.length > 0) {
        const counts = new Map<string, number>();
        for (const row of tagRows) {
          const arr = (row as { tags?: string[] | null }).tags ?? [];
          for (const t of arr) {
            counts.set(t, (counts.get(t) ?? 0) + 1);
          }
        }
        existing_tags = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([t]) => t);
      }
    } catch {
      // best-effort
    }
  }

  const tags = await suggestTagsFromBody({
    partial_body: partialBody,
    brand_slug: brandSlug,
    existing_tags,
  });

  return NextResponse.json({ tags });
}
