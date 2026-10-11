/**
 * Server-component wrapper around the onboarding client.
 *
 * Auth is gated here so anonymous visitors never see a wizard flash.
 * Finished profiles (name + consent) redirect home (or to a safe `next`
 * path, such as the QR check-in page they came from) — reopening
 * /onboarding must not reset to a blank 33% form.
 * Drafts rehydrate Preferred name, lane, and favorite brand.
 */

import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ONBOARDED_COOKIE, ONBOARDED_MAX_AGE } from "@/lib/auth-cookies";
import { safeRelativePath } from "@/lib/safe-redirect";
import { onboardingDoneHref, onboardingNextTarget } from "@/lib/onboarding-next";
import { getFirstSessionFacts } from "@/lib/data/first-session";
import { EMPTY_FIRST_SESSION_FACTS } from "@/lib/first-session";
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
  searchParams: Promise<{ ref?: string; next?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sp = (await searchParams) ?? {};
  const nextTarget = onboardingNextTarget(safeRelativePath(sp.next, ""));

  if (!user) {
    const params = new URLSearchParams();
    // Signup always routes through onboarding and carries `next` along.
    params.set("next", nextTarget ?? "/onboarding");
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
  } catch (err) {
    console.warn("onboarding: admin member load failed", err);
    member = null;
  }
  if (!member) {
    try {
      member = await loadMember(supabase);
    } catch (err) {
      console.warn("onboarding: user member load failed", err);
      member = null;
    }
  }

  if (isOnboardingComplete(member)) {
    const cookieStore = await cookies();
    cookieStore.set(ONBOARDED_COOKIE, "1", {
      path: "/",
      maxAge: ONBOARDED_MAX_AGE,
      sameSite: "lax",
    });
    redirect(onboardingDoneHref(nextTarget));
  }

  const initialForm = wizardFormFromMember(member, user.email);
  const initialStep = onboardingResumeStep(initialForm);
  const firstSession = (await getFirstSessionFacts()) ?? EMPTY_FIRST_SESSION_FACTS;
  const initialFacts = {
    ...firstSession,
    hasProfile:
      firstSession.hasProfile || Boolean(initialForm.firstName?.trim()),
  };

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-linen via-parchment to-parchment text-iron">
          <div className="mx-auto flex max-w-6xl items-center justify-center px-6 py-24">
            <p className="text-iron/70">Loading onboarding…</p>
          </div>
        </div>
      }
    >
      <OnboardingWizard
        initialForm={initialForm}
        initialStep={initialStep}
        initialFacts={initialFacts}
      />
    </Suspense>
  );
}
