/**
 * Server-component wrapper around the onboarding client.
 *
 * Auth is gated here (same pattern as /onboarding/chat) so anonymous
 * visitors never see a wizard flash before the client redirect runs.
 * Unauthenticated users are sent to signup with next=/onboarding so they
 * return to the profile wizard after creating an account.
 */

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingWizard from "./onboarding-client";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const sp = (await searchParams) ?? {};
    const params = new URLSearchParams();
    params.set("next", "/onboarding");
    if (sp.ref) params.set("ref", sp.ref);
    redirect(`/signup?${params.toString()}`);
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-center px-6 py-24">
            <p className="text-white/60">Loading onboarding…</p>
          </div>
        </div>
      }
    >
      <OnboardingWizard />
    </Suspense>
  );
}
