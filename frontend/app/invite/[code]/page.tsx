import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import SetRefCookie from "./set-ref-cookie";

export const metadata: Metadata = {
  title: "You're invited",
};

function inviteLinks(code: string) {
  const params = new URLSearchParams({ ref: code });
  return {
    signup: `/signup?${params.toString()}`,
    login: `/login?${params.toString()}`,
  };
}

async function getInviter(code: string): Promise<{
  firstName: string | null;
  referrerId: string;
} | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("members")
      .select("id, first_name")
      .eq("referral_code", code)
      .maybeSingle();
    if (!data) return null;
    return { firstName: (data.first_name as string | null) ?? null, referrerId: data.id as string };
  } catch {
    return null;
  }
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const inviter = await getInviter(code);
  if (!inviter) notFound();

  const inviterName = inviter.firstName ?? "A Brand Engage Pro member";
  const links = inviteLinks(code);

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <SetRefCookie code={code} />
      <section className="rounded-lg border border-iron/10 bg-gradient-to-br from-aurora/30 via-parchment to-ember/20 p-8 shadow-glass">
        <p className="text-xs uppercase tracking-[0.3em] text-iron/70">You&apos;re invited</p>
        <h1 className="mt-3 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          {inviterName} invited you to Brand Engage Pro
        </h1>
        <p className="mt-4 text-sm text-iron/75">
          Join in under a minute to earn points, get member rewards, and hear about new offers
          first. When you finish signing up, {inviterName} gets 150 bonus points for inviting you.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={links.signup}
            className="rounded-full bg-ember px-6 py-3 text-sm font-semibold text-linen shadow-glass transition hover:brightness-110"
          >
            Create your account
          </Link>
          <Link
            href={links.login}
            className="rounded-full border border-iron/20 px-6 py-3 text-sm font-medium text-iron/80 hover:bg-iron/10"
          >
            I already have an account
          </Link>
        </div>
        <p className="mt-6 text-xs text-iron/70">
          Invite code: <code className="font-mono">{code}</code>
        </p>
      </section>
    </main>
  );
}
