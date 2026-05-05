import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import SignupClient from "./signup-client";

/**
 * Server-component wrapper that provides the Suspense boundary
 * Next.js 15 requires for any page that calls useSearchParams().
 *
 * The actual client logic lives in ./signup-client.tsx.
 */
export default async function SignupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-white/60">
          Loading sign up…
        </div>
      }
    >
      <SignupClient />
    </Suspense>
  );
}
