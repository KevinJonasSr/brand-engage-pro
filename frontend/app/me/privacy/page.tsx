import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PrivacyForm from "./privacy-form";

export const metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PrivacyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/privacy");

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("public_profile_enabled, profile_slug")
    .eq("id", user.id)
    .maybeSingle();

  const publicProfileEnabled =
    (member?.public_profile_enabled as boolean | null) ?? true;
  const profileSlug = (member?.profile_slug as string | null) ?? null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <Link
          href="/me"
          className="text-xs uppercase tracking-widest text-white/60 hover:text-white"
        >
          ← Account
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="mt-3 text-white/70">
          Choose what other members can see about you. Personal info like
          email, phone, and address are always private — see below.
        </p>
      </header>

      <PrivacyForm
        initialPublicProfileEnabled={publicProfileEnabled}
        profileSlug={profileSlug}
      />
    </main>
  );
}
