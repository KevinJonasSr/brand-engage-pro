import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SIGNED_OUT_COOKIE, isSignedOutMarkerValue } from "@/lib/auth-cookies";
import { safeRelativePath } from "@/lib/safe-redirect";
import { getPolicy } from "@/lib/data/policies";
import SignupClient, { type ReferrerBrand } from "./signup-client";

export const metadata = { title: "Sign up" };

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

async function getReferrerBrand(slug: string | undefined): Promise<ReferrerBrand | null> {
  if (!slug) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("brands")
      .select("slug, name, tagline, accent_from, accent_to, active")
      .eq("slug", slug.toLowerCase())
      .eq("active", true)
      .maybeSingle();
    if (!data) return null;
    const row = data as {
      slug: string;
      name: string;
      tagline: string | null;
      accent_from: string;
      accent_to: string;
    };
    return {
      slug: row.slug,
      name: row.name,
      tagline: row.tagline,
      accentFrom: row.accent_from,
      accentTo: row.accent_to,
    };
  } catch {
    return null;
  }
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<{ ref?: string; next?: string }>;
}) {
  const cookieStore = await cookies();
  const signedOut = isSignedOutMarkerValue(
    cookieStore.get(SIGNED_OUT_COOKIE)?.value,
  );
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const sp = (await searchParams) ?? {};
  // After Sign out, leftover N24 must not bounce /signup mid-typing.
  if (user && !signedOut) redirect(safeRelativePath(sp.next, "/"));
  const [referrerName, referrerBrand, terms, privacy] = await Promise.all([
    getReferrerName(),
    getReferrerBrand(sp.ref),
    getPolicy("terms"),
    getPolicy("privacy"),
  ]);
  const consentDocs = [terms, privacy]
    .filter((p): p is NonNullable<typeof p> => !!p && !p.is_draft)
    .map((p) => ({ slug: p.slug, title: p.title, content_md: p.content_md }));
  return (
    <Suspense fallback={null}>
      <SignupClient
        referrerName={referrerName}
        referrerBrand={referrerBrand}
        consentDocs={consentDocs}
      />
    </Suspense>
  );
}
