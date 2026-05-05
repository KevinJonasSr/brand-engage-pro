/**
 * AI #9: Extract structured member-profile fields from a finished
 * onboarding chat (BEP).
 */

import type { ChatMessage } from "./conversation";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const EXTRACTION_MODEL = "claude-haiku-4-5";

export type ExtractedFields = {
  city: string | null;
  favorite_song: string | null;
  interest: string | null;
  sms_opted_in: boolean | null;
};

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

const EMPTY: ExtractedFields = {
  city: null,
  favorite_song: null,
  interest: null,
  sms_opted_in: null,
};

export async function extractFields(
  history: ChatMessage[],
): Promise<ExtractedFields> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || history.length === 0) return EMPTY;

  const transcript = history
    .map((m) => `${m.role === "user" ? "Member" : "Host"}: ${m.content}`)
    .join("\n");

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
      temperature: 0,
    }),
  });

  if (!response.ok) return EMPTY;

  const json = (await response.json()) as AnthropicMessageResponse;
  const text = (json.content.find((c) => c.type === "text")?.text ?? "").trim();
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return EMPTY;
  }
  if (typeof parsed !== "object" || parsed === null) return EMPTY;
  const r = parsed as Record<string, unknown>;

  return {
    city: stringOrNull(r.city, 80),
    favorite_song: stringOrNull(r.favorite_song, 200),
    interest: stringOrNull(r.interest, 400),
    sms_opted_in: typeof r.sms_opted_in === "boolean" ? r.sms_opted_in : null,
  };
}

function stringOrNull(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

const SYSTEM_PROMPT = `Extract structured member-profile fields from this onboarding chat. Output JSON ONLY.

Schema:
  {
    "city": string | null,
    "favorite_song": string | null,    // Used for "favorite item / product / thing about the brand". Stored in members.favorite_song column.
    "interest": string | null,
    "sms_opted_in": boolean | null
  }

Rules:
  * city: city name only (no state). Null if not mentioned.
  * favorite_song: their favorite item/product/thing from the brand (the column is named favorite_song for legacy reasons but used for any "favorite thing" answer). Null if not mentioned.
  * interest: 1-2 sentence summary of what the member said about the brand or what they're hoping for from membership. Null if nothing substantive.
  * sms_opted_in: true if they clearly said yes to SMS. false if they declined. Null if not asked.
  * Don't infer beyond what the member actually said. Empty answers → null.

Output JSON, nothing else.`;
