"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractFields,
  nextAssistantMessage,
  type ChatMessage,
  type NextTurnResult,
} from "@/lib/onboarding-chat";

export async function sendTurnAction(
  history: ChatMessage[],
): Promise<NextTurnResult> {
  const cleaned: ChatMessage[] = (Array.isArray(history) ? history : [])
    .filter(
      (m): m is ChatMessage =>
        m !== null &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  return await nextAssistantMessage(cleaned);
}

export async function finishAction(history: ChatMessage[]): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const fields = await extractFields(history);

  const updates: Record<string, unknown> = {};
  if (fields.city) updates.city = fields.city;
  if (fields.favorite_song) updates.favorite_song = fields.favorite_song;
  if (fields.interest) updates.interest = fields.interest;
  if (typeof fields.sms_opted_in === "boolean") {
    updates.sms_opted_in = fields.sms_opted_in;
  }

  if (Object.keys(updates).length > 0) {
    const admin = createAdminClient();
    await admin.from("members").update(updates).eq("id", user.id);
  }

  redirect("/");
}
