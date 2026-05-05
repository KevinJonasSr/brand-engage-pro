/**
 * Anthropic Claude client for moderation classification (BEP).
 *
 * Ported from Fan Engage. System prompt is genericized to "community
 * platform" so it fits BEP's brand-community use case as well as it fit
 * FE's music-fan-club use case.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

export const MODERATION_MODEL = "claude-haiku-4-5";
export const PROMPT_VERSION = "v1";

export const CATEGORIES = [
  "spam",
  "harassment",
  "hate_speech",
  "self_harm",
  "violence",
  "sexual",
  "pii_leak",
  "off_topic",
  "brigading",
  "other",
] as const;
export type ModerationCategory = (typeof CATEGORIES)[number];

export interface ModerationResult {
  status: "safe" | "flag_review" | "auto_hide";
  severity: 0 | 1 | 2 | 3 | 4 | 5;
  categories: ModerationCategory[];
  self_harm_detected: boolean;
  reason: string;
}

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
  stop_reason?: string;
}

interface AnthropicErrorResponse {
  error?: { message?: string; type?: string };
}

export class ModerationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ModerationError";
  }
}

export interface ModerationContext {
  community_id?: string;
  kind?: string;
  visibility?: string;
  parent_post_kind?: string;
}

export async function classifyContent(
  text: string,
  context: ModerationContext = {},
): Promise<ModerationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ModerationError(
      "ANTHROPIC_API_KEY is not set. Add it to Vercel env vars before the moderation pipeline can run.",
    );
  }

  const cleanText = (text ?? "").trim();
  if (!cleanText) {
    return {
      status: "safe",
      severity: 0,
      categories: [],
      self_harm_detected: false,
      reason: "Empty content.",
    };
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(cleanText, context);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODERATION_MODEL,
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const err = (await response.json()) as AnthropicErrorResponse;
      detail = err.error?.message ?? "";
    } catch {
      detail = await response.text();
    }
    throw new ModerationError(
      `Anthropic API ${response.status}: ${detail || response.statusText}`,
    );
  }

  const json = (await response.json()) as AnthropicMessageResponse;
  const textBlock = json.content.find((c) => c.type === "text")?.text ?? "";
  if (!textBlock) {
    throw new ModerationError("Empty response from Claude");
  }

  return parseClassifierOutput(textBlock);
}

function buildSystemPrompt(): string {
  return `You are a content moderation classifier for Brand Engage Pro, a
community platform where consumer brands engage their members. Your job
is to classify user-generated posts and comments by safety risk.

Output JSON ONLY, with no surrounding text or commentary. Schema:

{
  "status": "safe" | "flag_review" | "auto_hide",
  "severity": 0-5,
  "categories": [],
  "self_harm_detected": boolean,
  "reason": "1 sentence explanation"
}

Severity scale:
  0 = Totally safe; clearly on-topic member content.
  1 = Mild edge case (slight off-topic, lukewarm complaint). Status: safe.
  2 = Edge case worth a human eye (mild rudeness, plausibly off-topic). Status: flag_review.
  3 = Clear policy concern but not severe (heated argument, soft slur). Status: flag_review.
  4 = Serious violation (explicit harassment, scam link, doxxing). Status: auto_hide.
  5 = Severe violation (hate speech, explicit threats, CSAM signals). Status: auto_hide.

Categories (include all that apply, may be empty for safe content):
  spam, harassment, hate_speech, self_harm, violence, sexual,
  pii_leak, off_topic, brigading, other

Special cases:
  * SELF-HARM: If the content suggests the author is struggling with
    self-harm, suicidal ideation, or eating disorders, set
    self_harm_detected: true. Do NOT auto_hide self-harm posts — they're
    often help-seeking. Set status based on other factors only.
  * BRIGADING: Aggressive criticism of the brand coming from outside the
    actual community (e.g., trolls from competitor fandoms).
    Distinguish from honest critique by long-term members.
  * PII LEAK: Phone numbers, home addresses, real names of minors,
    private DM screenshots without consent. Severity 4-5.
  * OFF-TOPIC: Posts about completely unrelated topics. Severity 1-2.
    A post about a different brand in this brand's community is
    severity 2-3 (flag_review).

Be CALIBRATED. Most member content is severity 0-1. Don't over-flag mild
heated comments — members get passionate. Reserve severity 4-5 for
content that genuinely shouldn't be visible.`;
}

function buildUserPrompt(text: string, context: ModerationContext): string {
  const parts: string[] = [];
  parts.push("CONTEXT:");
  if (context.community_id) parts.push(`  Community: ${context.community_id}`);
  if (context.kind) parts.push(`  Kind: ${context.kind}`);
  if (context.visibility) parts.push(`  Visibility: ${context.visibility}`);
  if (context.parent_post_kind) {
    parts.push(`  Parent post kind: ${context.parent_post_kind}`);
  }
  parts.push("");
  parts.push("CONTENT:");
  parts.push(text);
  parts.push("");
  parts.push("Classify the content above. Output JSON only.");
  return parts.join("\n");
}

function parseClassifierOutput(raw: string): ModerationResult {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new ModerationError(
      `Classifier returned non-JSON output: ${stripped.slice(0, 200)}`,
      err,
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new ModerationError("Classifier output is not an object");
  }
  const obj = parsed as Record<string, unknown>;

  const status = obj.status;
  if (status !== "safe" && status !== "flag_review" && status !== "auto_hide") {
    throw new ModerationError(`Invalid status: ${String(status)}`);
  }

  const sev = Number(obj.severity);
  if (!Number.isInteger(sev) || sev < 0 || sev > 5) {
    throw new ModerationError(`Invalid severity: ${String(obj.severity)}`);
  }

  const rawCategories = Array.isArray(obj.categories) ? obj.categories : [];
  const categories: ModerationCategory[] = rawCategories
    .map((c) => String(c))
    .filter((c): c is ModerationCategory =>
      (CATEGORIES as readonly string[]).includes(c),
    );

  const selfHarm = obj.self_harm_detected === true;
  const reason = typeof obj.reason === "string" ? obj.reason : "";

  return {
    status,
    severity: sev as ModerationResult["severity"],
    categories,
    self_harm_detected: selfHarm,
    reason,
  };
}
