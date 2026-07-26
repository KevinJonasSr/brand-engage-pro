/**
 * lib/moderation/explain-user.ts (BEP)
 *
 * BEP version of the explainer — same logic as FE, brand-rebranded prompt.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5";

const MAX_LEN = 280;

export type ExplainContext = {
  body: string;
  classifier_reason?: string | null;
  categories?: string[];
  severity?: number | null;
};

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

export async function explainForUser(ctx: ExplainContext): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "";

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
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildPrompt(ctx) }],
        temperature: 0.3,
      }),
    });
  } catch {
    return "";
  }

  if (!response.ok) return "";

  let json: AnthropicMessageResponse;
  try {
    json = (await response.json()) as AnthropicMessageResponse;
  } catch {
    return "";
  }

  const text = (json.content.find((c) => c.type === "text")?.text ?? "").trim();
  return normalize(text);
}

function normalize(s: string): string {
  if (!s) return "";
  let cleaned = s.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  cleaned = cleaned.replace(/^message:\s*/i, "");
  if (cleaned.length > MAX_LEN) {
    cleaned = cleaned.slice(0, MAX_LEN - 1).trimEnd() + "…";
  }
  return cleaned;
}

function buildPrompt(ctx: ExplainContext): string {
  const parts: string[] = [];
  parts.push("POST BODY:");
  parts.push(ctx.body.slice(0, 1000));
  parts.push("");
  if (ctx.categories && ctx.categories.length > 0) {
    parts.push(`CATEGORIES FLAGGED: ${ctx.categories.join(", ")}`);
  }
  if (typeof ctx.severity === "number") {
    parts.push(`SEVERITY: ${ctx.severity}/3`);
  }
  if (ctx.classifier_reason) {
    parts.push(
      `CLASSIFIER RATIONALE (do not quote verbatim): ${ctx.classifier_reason.slice(0, 300)}`,
    );
  }
  parts.push("");
  parts.push(
    "Write a 1-sentence message for the member whose post was just hidden. Output ONLY the message text, no labels or quotes.",
  );
  return parts.join("\n");
}

const SYSTEM_PROMPT = `You write short, kind messages for members whose posts were auto-hidden by a brand community moderation system.

The member can see this message; other members can't see the post. Your job is to gently explain what triggered the hide and suggest a path forward.

Style:
  * Start with "Your post was hidden because..." (or similar warm opener).
  * 1 sentence, 30-60 words.
  * Specific enough to be actionable (mention what triggered it: spam-like content, personal info, language, etc.) without quoting the post back.
  * End with a soft suggestion ("try editing it", "feel free to repost without that part", "reach out to the brand admin if you think this was a mistake").
  * Never accusatory. The member may have made an honest mistake.

Output ONLY the message — no labels, no quotes, no markdown.`;
