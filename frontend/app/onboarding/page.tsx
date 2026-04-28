/**
 * Server-component wrapper around the onboarding client.
 *
 * The client (./onboarding-client) calls useSearchParams() at top level,
 * which Next.js 15+ requires to be inside a <Suspense> boundary. This
 * file exists solely to provide that boundary; everything else lives in
 * onboarding-client.tsx.
 */

import { Suspense } from "react";
import OnboardingWizard from "./onboarding-client";

export default function OnboardingPage() {
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
