import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SignupClient from "./signup-client";

export const metadata = { title: "Sign up · Brand Engage Pro" };

async function getReferrerName(): Promise<string | null> {
  const cookieStore = await cookies();
  const code = cookieStore.get("memberengage_ref")?.value;
  if (!code) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("members")
      .select("first_name")
      .eq("referral_code", code)
      .maybeSingle();
    const first = (data as { first_name?: string | null } | null)?.first_name;
    return first ?? null;
  } catch {
    return null;
  }
}

export default async function SignupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/");
  const referrerName = await getReferrerName();
  return (
    <Suspense fallback={null}>
      <SignupClient referrerName={referrerName} />
    </Suspense>
  );
}
