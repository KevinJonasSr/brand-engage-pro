import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * TEMPORARY diagnostic route — DELETE before public launch.
 * Surfaces what env Vercel is actually serving and what Supabase says back,
 * so we can pin down why getBrandFromDb is silently falling back to the
 * hardcoded BRANDS map.
 *
 * Returns:
 *   - urlPrefix:        first 35 chars of NEXT_PUBLIC_SUPABASE_URL (project ref visible)
 *   - anonKeyPrefix:    first 12 chars of NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   - servicePrefix:    first 12 chars of SUPABASE_SERVICE_ROLE_KEY
 *   - brandsCount:      result/error of `select count(*) from brands`
 *   - nelliesRow:       result/error of `select … from brands where slug='nellies'`
 *   - rawProbe:         raw fetch to PostgREST /rest/v1/brands?slug=eq.nellies
 *
 * No secrets exposed (only key prefixes).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(missing)";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "(missing)";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "(missing)";

  const result: Record<string, unknown> = {
    urlPrefix: url.slice(0, 35),
    anonKeyPrefix: anon.slice(0, 12),
    servicePrefix: service.slice(0, 12),
    anonKeyLen: anon.length,
    serviceKeyLen: service.length,
  };

  // 1. Supabase JS client probe — this is the path getBrandFromDb takes.
  try {
    const supabase = await createClient();
    const { count, error: countErr } = await supabase
      .from("brands")
      .select("*", { count: "exact", head: true });
    result.brandsCount = countErr
      ? { error: { message: countErr.message, code: countErr.code, details: countErr.details } }
      : { count };

    const { data: nellie, error: nellieErr } = await supabase
      .from("brands")
      .select("slug, name, active, city, state, cuisine")
      .eq("slug", "nellies")
      .maybeSingle();
    result.nelliesRow = nellieErr
      ? { error: { message: nellieErr.message, code: nellieErr.code, details: nellieErr.details } }
      : { row: nellie };
  } catch (e) {
    result.clientThrew = String(e);
  }

  // 2. Raw PostgREST probe — bypasses our client wrapper to confirm the
  //    URL+key combo can reach a Supabase instance at all.
  try {
    const probeRes = await fetch(`${url}/rest/v1/brands?slug=eq.nellies&select=slug,name,active`, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      cache: "no-store",
    });
    const text = await probeRes.text();
    result.rawProbe = {
      status: probeRes.status,
      ok: probeRes.ok,
      body: text.slice(0, 500),
    };
  } catch (e) {
    result.rawProbeThrew = String(e);
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
