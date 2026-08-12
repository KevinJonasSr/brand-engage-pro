/**
 * /api/cron/alt-text-backfill (BEP)
 * Mirrors FE — uses brand_slug + brands table for context lookup.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAltText } from "@/lib/alt-text/generate";
import { verifyCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PER_TICK = 10;

interface PostRow {
  id: string;
  image_url: string;
  body: string | null;
  brand_slug: string | null;
}

interface RunResult {
  ok: boolean;
  scanned: number;
  generated: number;
  skipped_empty: number;
  errors: number;
  details: Array<{
    id: string;
    outcome: "generated" | "empty" | "error";
    note?: string;
  }>;
}

export async function GET(req: Request) {
  const authErr = verifyCronAuth(req);
  if (authErr) return authErr;

  const admin = createAdminClient();

  const { data: posts, error: queryErr } = await admin
    .from("community_posts")
    .select("id, image_url, image_alt, body, brand_slug")
    .not("image_url", "is", null)
    .is("image_alt", null)
    .order("created_at", { ascending: false })
    .limit(MAX_PER_TICK);

  if (queryErr) {
    return NextResponse.json(
      { ok: false, error: "query_failed", detail: queryErr.message },
      { status: 500 },
    );
  }

  const result: RunResult = {
    ok: true,
    scanned: 0,
    generated: 0,
    skipped_empty: 0,
    errors: 0,
    details: [],
  };

  const brandNameCache = new Map<string, string | null>();

  for (const row of (posts ?? []) as PostRow[]) {
    result.scanned += 1;
    if (!row.image_url) {
      result.skipped_empty += 1;
      result.details.push({ id: row.id, outcome: "empty", note: "no image_url" });
      continue;
    }

    try {
      let brandName: string | null = null;
      if (row.brand_slug) {
        if (brandNameCache.has(row.brand_slug)) {
          brandName = brandNameCache.get(row.brand_slug) ?? null;
        } else {
          const { data: b } = await admin
            .from("brands")
            .select("name")
            .eq("slug", row.brand_slug)
            .maybeSingle();
          brandName = (b as { name?: string | null } | null)?.name ?? null;
          brandNameCache.set(row.brand_slug, brandName);
        }
      }

      const altText = await generateAltText({
        image_url: row.image_url,
        artist_or_brand_name: brandName,
        partial_body: row.body ?? "",
      });

      if (!altText) {
        result.skipped_empty += 1;
        result.details.push({ id: row.id, outcome: "empty", note: "vision returned empty" });
        continue;
      }

      const { error: updateErr } = await admin
        .from("community_posts")
        .update({ image_alt: altText })
        .eq("id", row.id);

      if (updateErr) throw updateErr;

      result.generated += 1;
      result.details.push({ id: row.id, outcome: "generated" });
    } catch (err) {
      result.errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[cron alt-text-backfill] failed for", row.id, msg);
      result.details.push({ id: row.id, outcome: "error", note: msg });
    }
  }

  return NextResponse.json(result);
}
