import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin";
import { suggestPredictions } from "@/lib/ai/prediction-suggestions";
import type { PredictionType } from "@/lib/predictions/types";

/**
 * POST /api/ai/suggest-predictions
 *
 * Admin-only. Body: { brandSlug, types?: PredictionType[], topicSeed?: string }
 * Returns: { suggestions: PredictionSuggestion[] }
 *
 * Failure mode: returns { suggestions: [] } with a 200 status when the
 * model can't produce anything (missing API key, transient OpenAI error).
 * The UI shows a retry hint in that case.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const adminUser = await getAdminUser();
  if (!adminUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    brandSlug?: string;
    types?: PredictionType[];
    topicSeed?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const brandSlug = (body.brandSlug ?? "").trim();
  if (!brandSlug) return NextResponse.json({ error: "missing_brand" }, { status: 400 });

  const types: PredictionType[] = Array.isArray(body.types)
    ? body.types.filter((t): t is PredictionType =>
        ["multi", "numeric", "date"].includes(t),
      )
    : ["multi", "numeric", "date"];

  const suggestions = await suggestPredictions({
    brandSlug,
    types: types.length > 0 ? types : undefined,
    topicSeed: body.topicSeed?.trim() || null,
  });

  return NextResponse.json({ suggestions });
}
