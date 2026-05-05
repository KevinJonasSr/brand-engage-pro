/**
 * /onboarding/chat (BEP)
 *
 * AI #9: Conversational onboarding (post-signup enrichment).
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingChatClient from "./onboarding-chat-client";

export const dynamic = "force-dynamic";

export default async function OnboardingChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding/chat");

  const { data: member } = await supabase
    .from("members")
    .select("first_name")
    .eq("id", user.id)
    .maybeSingle();
  const firstName = (member as { first_name?: string | null } | null)?.first_name ?? null;

  const greeting = firstName
    ? `Hey ${firstName} — welcome in. I'm gonna ask a few quick questions so we can tune Brand Engage to you. What brought you to this brand?`
    : `Hey, welcome in. I'm gonna ask a few quick questions so we can tune Brand Engage to you. What brought you to this brand?`;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          Welcome
        </p>
        <h1
          className="text-3xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          A few quick things
        </h1>
        <p className="max-w-xl text-sm text-white/70">
          Chat with Claude for a minute so we know who you are — city,
          favorite items, why you're here. You can skip and finish later
          from your profile.
        </p>
      </header>

      <OnboardingChatClient initialMessage={greeting} />
    </main>
  );
}
