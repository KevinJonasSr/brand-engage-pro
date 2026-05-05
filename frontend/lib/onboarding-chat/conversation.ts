/**
 * AI #9: Conversational onboarding (BEP).
 *
 * Brand-rebranded prompt for consumer-brand member onboarding.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
export const ONBOARDING_MODEL = "claude-haiku-4-5";

const MAX_ASSISTANT_TURNS = 8;

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type NextTurnResult = {
  message: string;
  done: boolean;
};

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

export async function nextAssistantMessage(
  history: ChatMessage[],
): Promise<NextTurnResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      message: "Onboarding chat isn't configured yet. Skip for now and we'll catch up later.",
      done: true,
    };
  }

  const assistantTurns = history.filter((m) => m.role === "assistant").length;
  if (assistantTurns >= MAX_ASSISTANT_TURNS) {
    return {
      message: "Thanks for sharing! Click below to save and head into Brand Engage Pro.",
      done: true,
    };
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ONBOARDING_MODEL,
        max_tokens: 220,
        system: SYSTEM_PROMPT,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      return {
        message: "Hmm, my brain's offline for a sec. Want to skip and finish later?",
        done: false,
      };
    }

    const json = (await response.json()) as AnthropicMessageResponse;
    const text = (json.content.find((c) => c.type === "text")?.text ?? "").trim();
    if (!text) {
      return { message: "Anything else you want to share?", done: false };
    }

    const lines = text.split(/\r?\n/);
    const lastLine = lines[lines.length - 1]?.trim();
    if (lastLine === "DONE") {
      const cleaned = lines.slice(0, -1).join("\n").trim();
      return {
        message:
          cleaned ||
          "Awesome — that's all I needed. Click below to save and continue.",
        done: true,
      };
    }
    if (text === "DONE") {
      return { message: "All set! Click below to save and continue.", done: true };
    }

    return { message: text, done: false };
  } catch {
    return {
      message: "Something hiccuped on my end. Try sending again.",
      done: false,
    };
  }
}

const SYSTEM_PROMPT = `You're a friendly onboarding host for Brand Engage Pro, a community platform where consumer brands engage their members. You're greeting a new member to learn a few things so we can personalize their experience.

Ask 4-5 short, conversational questions, ONE AT A TIME. Topics to cover (in any order, weave them naturally — don't just go down a list):
  - What brought them to this brand — what they love about it / how they discovered it
  - What city they're in (so we can match them with location-based offers)
  - Their favorite item, product, or thing about the brand
  - Whether they want SMS for limited drops and announcements (just ask yes or no)

Tone: warm, brief, fellow-customer energy. Use short sentences. Don't be salesy.

Don't ask about their email or password — those are already set during signup.

Don't ask things you already know from earlier in the conversation. Acknowledge their previous answer briefly before the next question.

After you've gathered answers on 4 of the 4 topics above (or after 5 of your own messages), output exactly:

DONE

on its own line, optionally with a short "thanks, that's all I needed" sentence above it.`;
