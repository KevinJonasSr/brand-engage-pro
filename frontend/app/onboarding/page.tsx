/**
 * Server-component wrapper around the onboarding client.
 *
 * Auth is gated here so anonymous visitors never see a wizard flash.
 * Finished profiles (name + consent) redirect home — reopening
 * /onboarding must not reset to a blank 33% form.
 * Drafts rehydrate Preferred name, lane, and favorite brand.
 */

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isOnboardingComplete,
  onboardingResumeStep,
  resolveOnboardingMember,
  wizardFormFromMember,
  type OnboardingMemberRow,
} from "@/lib/onboard-profile";
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

  const loadMember = async (
    client: ReturnType<typeof createAdminClient> | typeof supabase,
  ) =>
    resolveOnboardingMember(async (columns) => {
      const { data, error } = await client
        .from("members")
        .select(columns)
        .eq("id", user.id)
        .maybeSingle();
      return { data: (data as OnboardingMemberRow | null) ?? null, error };
    });

  let member: OnboardingMemberRow | null = null;
  try {
    member = await loadMember(createAdminClient());
  } catch {
    member = null;
  }
  if (!member) {
    try {
      member = await loadMember(supabase);
    } catch {
      member = null;
    }
  }

  if (isOnboardingComplete(member)) {
    redirect("/");
  }

  const initialForm = wizardFormFromMember(member, user.email);
  const initialStep = onboardingResumeStep(initialForm);

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
      <OnboardingWizard initialForm={initialForm} initialStep={initialStep} />
    </Suspense>
  );
}
