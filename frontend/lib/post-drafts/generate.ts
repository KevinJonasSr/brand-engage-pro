/**
 * AI #18: Generate a draft community post on behalf of a brand (BEP).
 *
 * Strict no-invention prompt. Claude only uses the provided context.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
export const DRAFT_MODEL = "claude-haiku-4-5";

export type DraftContext = {
  brand_slug: string;
  brand_name?: string | null;
  upcoming_events: Array<{
    title: string;
    event_starts_at?: string | null;
    detail?: string | null;
  }>;
  recent_admin_posts: Array<{
    kind: string;
    title: string | null;
    body: string;
  }>;
  recent_member_comments_sample: Array<{ body: string }>;
};

export type DraftOutput = {
  kind: "post" | "announcement";
  title: string | null;
  body: string;
  context_summary: string;
};

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

export class DraftGenerationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "DraftGenerationError";
  }
}

export async function generateBrandPostDraft(
  context: DraftContext,
): Promise<DraftOutput | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const userPrompt = buildUserPrompt(context);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DRAFT_MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new DraftGenerationError(`Anthropic ${response.status}: ${detail}`);
  }

  const json = (await response.json()) as AnthropicMessageResponse;
  const text = (json.content.find((c) => c.type === "text")?.text ?? "").trim();
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new DraftGenerationError(
      `Claude returned non-JSON: ${stripped.slice(0, 200)}`,
    );
  }

  return validateOutput(parsed);
}

function validateOutput(raw: unknown): DraftOutput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const kind = r.kind === "announcement" ? "announcement" : "post";
  const title = typeof r.title === "string" && r.title.trim().length > 0
    ? r.title.trim().slice(0, 200)
    : null;
  const body = typeof r.body === "string" && r.body.trim().length > 0
    ? r.body.trim().slice(0, 2000)
    : "";
  if (!body) return null;
  const context_summary = typeof r.context_summary === "string"
    ? r.context_summary.trim().slice(0, 400)
    : "";

  return { kind, title, body, context_summary };
}

function buildUserPrompt(ctx: DraftContext): string {
  const parts: string[] = [];
  parts.push(`BRAND: ${ctx.brand_name ?? ctx.brand_slug}`);
  parts.push("");

  if (ctx.upcoming_events.length > 0) {
    parts.push(`UPCOMING EVENTS (${ctx.upcoming_events.length}):`);
    for (const e of ctx.upcoming_events) {
      const date = e.event_starts_at ? ` — ${e.event_starts_at.slice(0, 10)}` : "";
      const detail = e.detail ? ` — ${e.detail.slice(0, 150)}` : "";
      parts.push(`  • ${e.title}${date}${detail}`);
    }
    parts.push("");
  } else {
    parts.push("UPCOMING EVENTS: (none scheduled)");
    parts.push("");
  }

  if (ctx.recent_admin_posts.length > 0) {
    parts.push(`RECENT ADMIN POSTS (last few — DO NOT REPEAT THESE TOPICS):`);
    for (const p of ctx.recent_admin_posts) {
      const title = p.title ? `[${p.title}] ` : "";
      const body = p.body.length > 160 ? p.body.slice(0, 160) + "…" : p.body;
      parts.push(`  • (${p.kind}) ${title}${body}`);
    }
    parts.push("");
  }

  if (ctx.recent_member_comments_sample.length > 0) {
    parts.push(`RECENT MEMBER COMMENTS (tone signal — what members are saying):`);
    for (const c of ctx.recent_member_comments_sample) {
      const body = c.body.length > 120 ? c.body.slice(0, 120) + "…" : c.body;
      parts.push(`  • ${body}`);
    }
    parts.push("");
  }

  parts.push(`Draft a community post for this brand. Output JSON ONLY:
  {
    "kind": "post" | "announcement",
    "title": string | null,
    "body": string,
    "context_summary": string  // 1 sentence: what facts you used to draft this
  }

CRITICAL RULES:
  * Use ONLY facts from the inputs above. Don't invent products, dates, locations, or quotes.
  * If upcoming events are empty and there's nothing fresh to say, write a short check-in post about the member comments above (not announcing anything).
  * Don't repeat topics from RECENT ADMIN POSTS.
  * Don't make promises on the brand's behalf. Frame as inclusive ("we", "the team", "the community").
  * Use "announcement" kind only when the post is sharing a real upcoming event. Otherwise use "post".
  * Keep body 60-180 words. Conversational, fellow-customer energy. No exclamation points stacked at the end.

Output JSON, nothing else.`);

  return parts.join("\n");
}

const SYSTEM_PROMPT = `You draft community posts for consumer brands' member-platform feeds. You're the brand's ghostwriter — friendly, on-brand, never inventing.

Your job: take the provided inputs (upcoming events, recent admin posts, member comments) and write ONE candidate post. The brand's admin will review and approve before it ships.

Style: warm, brief, fellow-customer voice. Match the tone of recent admin posts when present. Default to "post" kind unless announcing a real event.

Hard rules:
  * NEVER invent events, dates, locations, products, or quotes. Use only what's provided.
  * NEVER promise on the brand's behalf. Use "we", "the team", "the community" rather than "I".
  * NEVER repeat a topic from RECENT ADMIN POSTS. Diversify.
  * Output JSON only — no markdown fences, no commentary.`;
