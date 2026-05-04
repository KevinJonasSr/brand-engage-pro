import { createAdminClient } from "@/lib/supabase/admin";
import type { PredictionSuggestion, PredictionType } from "@/lib/predictions/types";

/**
 * AI-generated prediction suggestions for the admin create form.
 *
 * Inputs:
 *   brandSlug — the brand we're seeding the prediction for. We pull the
 *               brand row + recent posts + upcoming events to ground the
 *               model in current context.
 *   types     — which prediction subtypes the admin wants suggested. We
 *               return ~5 suggestions evenly mixed across the requested
 *               types. Defaults to all three.
 *   topicSeed — optional admin-provided nudge ("focus on summer specials").
 *
 * Output: an array of PredictionSuggestion objects the admin can pick
 * from. Each is fully editable before save.
 *
 * Failure mode: any error returns an empty array. The UI shows
 * "AI couldn't suggest anything right now — try again" and the admin
 * just types the prediction themselves.
 *
 * Cost note: one OpenAI call per click. We cap context size and use
 * gpt-4o-mini for low cost / fast response. Typical run is ~3¢.
 */

const MODEL = "gpt-4o-mini";

interface SuggestionContext {
  brandName: string;
  brandCategory: string | null;
  brandTagline: string | null;
  recentPosts: { kind: string; title: string }[];
  upcomingEvents: { title: string; starts_at: string; detail: string | null }[];
}

async function gatherContext(brandSlug: string): Promise<SuggestionContext | null> {
  const admin = createAdminClient();
  const [{ data: brand }, { data: posts }, { data: events }] = await Promise.all([
    admin
      .from("brands")
      .select("name, category, tagline")
      .eq("slug", brandSlug)
      .maybeSingle(),
    admin
      .from("community_posts")
      .select("kind, title, created_at")
      .eq("brand_slug", brandSlug)
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("brand_events")
      .select("title, starts_at, detail")
      .eq("brand_slug", brandSlug)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(5),
  ]);

  if (!brand) return null;
  return {
    brandName: (brand.name as string) ?? brandSlug,
    brandCategory: (brand.category as string | null) ?? null,
    brandTagline: (brand.tagline as string | null) ?? null,
    recentPosts:
      (posts ?? []).map((p) => ({
        kind: p.kind as string,
        title: (p.title as string | null) ?? "",
      })) ?? [],
    upcomingEvents:
      (events ?? []).map((e) => ({
        title: (e.title as string | null) ?? "",
        starts_at: e.starts_at as string,
        detail: (e.detail as string | null) ?? null,
      })) ?? [],
  };
}

const SYSTEM_PROMPT = `You are a community manager assistant for Brand Engage Pro,
a brand-loyalty platform. Brands run "predictions" — engagement polls with a
correct answer revealed later, where members earn points for guessing right.

Your job: suggest 5 prediction questions the brand could post to drive engagement.
Mix the requested subtypes evenly. Each suggestion should:
  - Be specific to THIS brand (use the context provided)
  - Have a clear, observable correct answer the admin can verify in 1-7 days
  - Feel like something fans would actually want to guess
  - Avoid politics, religion, anything controversial
  - Avoid asking about private brand data members can't reasonably guess

Return JSON only, matching this exact shape:
{
  "suggestions": [
    {
      "prediction_type": "multi" | "numeric" | "date",
      "title": "string (the question, < 100 chars)",
      "body": "string | null (optional 1-2 sentence context, < 200 chars)",
      "options": ["string", ...]   // ONLY for prediction_type='multi', 2-5 items
      "numeric_unit": "string"     // ONLY for 'numeric', the unit ("biscuits", "miles", "songs")
      "numeric_correct_hint": null // null — admin fills in actual answer at resolve time
      "date_correct_hint": null    // null — admin fills in actual answer at resolve time
      "suggested_close_in_hours": number,  // 24, 48, 72, 168 (1 week)
      "suggested_points": number,  // 10, 25, 50, 100 — typical reward
      "suggested_strategy": "exact" | "closest" | "closest_no_over"
    },
    ...
  ]
}

Rules:
  - For 'multi': always include 'options' (2-5 strings). Omit numeric_*/date_*.
  - For 'numeric': always include 'numeric_unit'. Omit options/date_*.
  - For 'date': omit options and numeric_*.
  - 'closest_no_over' only fits Price-Is-Right-style numeric guesses.
  - 'closest' is the right default for numeric/date (pure proximity).
  - Multi predictions ignore award_strategy (always exact-match).`;

function buildUserPrompt(
  ctx: SuggestionContext,
  types: PredictionType[],
  topicSeed: string | null,
): string {
  const parts: string[] = [];
  parts.push(`Brand: ${ctx.brandName}`);
  if (ctx.brandCategory) parts.push(`Category: ${ctx.brandCategory}`);
  if (ctx.brandTagline) parts.push(`Tagline: ${ctx.brandTagline}`);

  if (ctx.upcomingEvents.length > 0) {
    parts.push(
      "\nUpcoming events:\n" +
        ctx.upcomingEvents
          .slice(0, 5)
          .map((e) => `  - ${e.title} (${e.starts_at.slice(0, 10)})${e.detail ? ` — ${e.detail.slice(0, 80)}` : ""}`)
          .join("\n"),
    );
  }

  if (ctx.recentPosts.length > 0) {
    parts.push(
      "\nRecent posts:\n" +
        ctx.recentPosts
          .slice(0, 8)
          .map((p) => `  - [${p.kind}] ${p.title}`)
          .join("\n"),
    );
  }

  parts.push(`\nRequested prediction types: ${types.join(", ")}`);
  if (topicSeed) parts.push(`\nFocus area (admin nudge): ${topicSeed}`);
  parts.push(
    "\nReturn 5 suggestions, distributed evenly across the requested types. JSON only.",
  );
  return parts.join("\n");
}

export async function suggestPredictions(opts: {
  brandSlug: string;
  types?: PredictionType[];
  topicSeed?: string | null;
}): Promise<PredictionSuggestion[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY missing — suggestPredictions returning empty");
    return [];
  }

  const ctx = await gatherContext(opts.brandSlug);
  if (!ctx) return [];

  const types: PredictionType[] = opts.types && opts.types.length > 0
    ? opts.types
    : ["multi", "numeric", "date"];

  const userPrompt = buildUserPrompt(ctx, types, opts.topicSeed ?? null);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      console.warn("suggestPredictions OpenAI error", res.status);
      return [];
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return [];
    const parsed = JSON.parse(content) as { suggestions?: PredictionSuggestion[] };
    const suggestions = parsed?.suggestions ?? [];
    // Defensive: filter out any malformed shapes
    return suggestions.filter(
      (s) =>
        s &&
        typeof s.title === "string" &&
        ["multi", "numeric", "date"].includes(s.prediction_type),
    );
  } catch (err) {
    console.warn("suggestPredictions failed:", err);
    return [];
  }
}
