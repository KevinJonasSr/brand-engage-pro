/**
 * AI #14: Long-thread summarization (BEP).
 *
 * Given a post id, fetches the post body + recent comments and asks
 * Claude Haiku 4.5 for a 2-3 sentence summary. Brand-genericized
 * system prompt (consumer brand communities, not music fan clubs).
 */

import { createAdminClient } from "@/lib/supabase/admin";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
export const SUMMARY_MODEL = "claude-haiku-4-5";

const MAX_COMMENTS_IN_PROMPT = 60;
const MAX_BODY_CHARS = 600;
const MAX_COMMENT_CHARS = 280;
const MAX_SUMMARY_CHARS = 800;

export type ThreadSummaryResult = {
  summary: string;
  commentCount: number;
};

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

export class ThreadSummaryError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ThreadSummaryError";
  }
}

export async function summarizeThread(
  postId: string,
): Promise<ThreadSummaryResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const admin = createAdminClient();

  const { data: postRow } = await admin
    .from("community_posts")
    .select("id, body, kind")
    .eq("id", postId)
    .maybeSingle();
  if (!postRow) return null;
  const post = postRow as { id: string; body: string | null; kind: string | null };

  const { data: commentsRow } = await admin
    .from("community_comments")
    .select("body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(MAX_COMMENTS_IN_PROMPT);
  const comments = (commentsRow ?? []) as Array<{
    body: string | null;
    created_at: string;
  }>;
  if (comments.length < 2) return null;

  const prompt = buildPrompt(post, comments);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      max_tokens: 240,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new ThreadSummaryError(`Anthropic ${response.status}: ${detail}`);
  }

  const json = (await response.json()) as AnthropicMessageResponse;
  const text = (json.content.find((c) => c.type === "text")?.text ?? "").trim();
  if (!text) return null;

  return {
    summary: clean(text),
    commentCount: comments.length,
  };
}

function buildSystemPrompt(): string {
  return `You write very short thread summaries for a consumer brand community platform's discussion pages.

Output 2-3 sentences, total under 60 words. Lead with the topic, then the dominant takeaways or reactions. No preamble like "This thread", "In this discussion". No bullet lists. No emoji. No exclamation points.

Examples of the tone we want:
  * "Reaction to the new menu item drop. Most members want spicy back on the menu; a vocal minority is asking for vegetarian options. Brand hasn't weighed in."
  * "Loyalty tier debate sparked by the recent point recalibration. Members at the bronze level feel left behind; gold and platinum are mostly satisfied."
  * "Holiday merch collection feedback. The fleece pullover is a clear winner — 14 of 22 comments mention it. Mug colorway is contentious."

Newsroom-dry, not cheerleader-loud. Reference at least one specific detail from the thread.`;
}

function buildPrompt(
  post: { body: string | null; kind: string | null },
  comments: Array<{ body: string | null; created_at: string }>,
): string {
  const parts: string[] = [];
  const bodyText = (post.body ?? "").slice(0, MAX_BODY_CHARS);
  parts.push(`POST (${post.kind ?? "post"}): ${bodyText || "(no body)"}`);
  parts.push("");
  parts.push(`COMMENTS (${comments.length}):`);
  for (const c of comments) {
    const body = (c.body ?? "").slice(0, MAX_COMMENT_CHARS);
    if (!body.trim()) continue;
    parts.push(`  - ${body}`);
  }
  parts.push("");
  parts.push("Write the 2-3 sentence summary. Just the sentences, no quotes, no preamble.");
  return parts.join("\n");
}

function clean(text: string): string {
  let out = text.trim();
  out = out.replace(/^"+/, "").replace(/"+$/, "");
  out = out.replace(/^'+/, "").replace(/'+$/, "");
  if (out.length > MAX_SUMMARY_CHARS) {
    out = out.slice(0, MAX_SUMMARY_CHARS - 1) + "…";
  }
  return out;
}
