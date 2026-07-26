import Link from "next/link";
import type { Metadata } from "next";
import SetFadCookies from "./set-fad-cookies";

export const metadata: Metadata = {
  title: "Join Brand Engage Pro",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function humanizeSlug(slug: string): string {
  const cleaned = slug.replace(/--[a-z0-9]+$/i, "");
  return cleaned
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const fad_ref = first(params.fad_ref);
  const fad_tenant = first(params.fad_tenant);
  const fad_campaign = first(params.fad_campaign);
  const fad_channel = first(params.fad_channel);
  const utm_source = first(params.utm_source);
  const utm_medium = first(params.utm_medium);
  const utm_campaign = first(params.utm_campaign);

  const inviterLabel = fad_tenant ? humanizeSlug(fad_tenant) : "A Brand Engage Pro partner";

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <SetFadCookies
        values={{
          fad_ref,
          fad_tenant,
          fad_campaign,
          fad_channel,
          utm_source,
          utm_medium,
          utm_campaign,
        }}
      />
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-aurora/30 via-slate-900 to-ember/20 p-8 shadow-glass">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">You&apos;re invited</p>
        <h1 className="mt-3 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          {inviterLabel} invited you to Brand Engage Pro
        </h1>
        <p className="mt-4 text-sm text-white/75">
          You&apos;re one of their top fans — join in under a minute for rewards, early drops,
          VIP experiences, and a 150-point signup bonus.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
          >
            Create your account
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
          >
            I already have an account
          </Link>
        </div>
        {fad_ref ? (
          <p className="mt-6 text-xs text-white/50">
            Referral: <code className="font-mono">{fad_ref.slice(0, 8)}…</code>
          </p>
        ) : null}
      </section>
    </main>
  );
}
