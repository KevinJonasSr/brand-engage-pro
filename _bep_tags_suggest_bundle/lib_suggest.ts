/**
 * Member-facing tag suggestion (BEP, lib/tagging/suggest.ts).
 *
 * BEP mirror of FE's lib/tagging/suggest.ts. Identical prompt strategy
 * but uses brand_slug context.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5";

const MAX_TAGS = 3;
const MAX_TAG_LEN = 24;

export type TagSuggestionContext = {
  partial_body: string;
  brand_slug?: string;
  /** Optional: top tags already in use in this brand's community. */
  existing_tags?: string[];
};

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

export async function suggestTagsFromBody(
  ctx: TagSuggestionContext,
): Promise<string[]> {
  const body = ctx.partial_body.trim();
  if (body.length < 12) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 120,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(ctx) }],
        temperature: 0.2,
      }),
    });
  } catch {
    return [];
  }

  if (!response.ok) return [];

  let json: AnthropicMessageResponse;
  try {
    json = (await response.json()) as AnthropicMessageResponse;
  } catch {
    return [];
  }

  const text = (json.content.find((c) => c.type === "text")?.text ?? "").trim();
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return [];
  }

  return validateTags(parsed);
}

function validateTags(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null) return [];
  const r = raw as Record<string, unknown>;
  const list = Array.isArray(r.tags) ? r.tags : [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const t = normalizeTag(item);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function normalizeTag(s: string): string | null {
  const cleaned = s
    .toLowerCase()
    .trim()
    .replace(/^#/, "")
    .replace(/[^a-z0-9\-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  if (cleaned.length < 2 || cleaned.length > MAX_TAG_LEN) return null;
  return cleaned;
}

function buildUserPrompt(ctx: TagSuggestionContext): string {
  const parts: string[] = [];
  parts.push("POST BODY:");
  parts.push(ctx.partial_body.slice(0, 800));
  parts.push("");
  if (ctx.existing_tags && ctx.existing_tags.length > 0) {
    parts.push(
      `EXISTING TAGS IN THIS COMMUNITY (prefer these when they fit): ${ctx.existing_tags.slice(0, 20).join(", ")}`,
    );
    parts.push("");
  }
  parts.push(
    `Suggest 1-3 short tags that capture what this post is about. Output JSON ONLY:
  { "tags": ["tag-one", "tag-two"] }

Rules:
  * Lowercase, hyphenated, single concept per tag (e.g. "menu-update", "behind-the-scenes", "events")
  * 1-3 tags max, fewer if the body doesn't suggest more
  * No generic filler ("post", "update", "fyi")
  * Output JSON only, no commentary.`,
  );
  return parts.join("\n");
}

const SYSTEM_PROMPT = `You tag brand community posts with short, useful labels. Tags help members filter by topic.

Style: lowercase, hyphenated, concrete. Match the existing taxonomy when possible.

Hard rules:
  * NEVER invent topics not present in the body.
  * 1-3 tags maximum.
  * Output JSON only — no markdown fences, no commentary.`;
