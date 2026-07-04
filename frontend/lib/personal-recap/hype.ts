import type { WeeklyRecap } from "./types";

/** One warm hype line via Haiku; deterministic fallback without a key. */
export async function generateHypeLine(recap: WeeklyRecap): Promise<string> {
  const fallback = recap.hasActivity
    ? `You earned ${recap.pointsEarned.toLocaleString()} points this week${
        recap.topBrandName ? ` — ${recap.topBrandName} is lucky to have you` : ""
      }.`
    : `A quiet week — but your streak and points aren't going anywhere. Come say hi.`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 120,
        system:
          "Write ONE warm, specific hype sentence (max 30 words) celebrating a loyalty-program member's week, using only the numbers provided. Second person. No emoji, no hashtags, no invented facts. Reply with the sentence only.",
        messages: [{ role: "user", content: JSON.stringify(recap) }],
      }),
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const text = json.content.find((c) => c.type === "text")?.text?.trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}
