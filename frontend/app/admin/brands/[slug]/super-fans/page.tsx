import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSuperFanRadarSummary } from "@/lib/superfan-radar/query";

export const dynamic = "force-dynamic";

const TIER_STYLES: Record<string, string> = {
  ELITE: "bg-emerald-500/20 text-emerald-300",
  CORE: "bg-amber-500/20 text-amber-300",
  CANDIDATE: "bg-white/10 text-white/60",
  NONE: "bg-white/10 text-white/40",
};

export default async function AdminBrandSuperFansPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: brand } = await admin
    .from("brands")
    .select("slug, name")
    .eq("slug", slug)
    .maybeSingle();

  if (!brand) notFound();

  const summary = await getSuperFanRadarSummary(slug);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/admin/brands/${slug}`} className="text-xs text-white/60 hover:text-white">
            ← Back to {brand.name as string}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Super Fans
          </h1>
          <p className="mt-1 text-xs text-white/60">
            Read-only summary from Super Fan Radar. /{brand.slug as string}
          </p>
        </div>
        <a
          href="https://fan-analytics-dashboard.vercel.app/dashboard"
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/80 hover:bg-white/10"
        >
          Manage full Super Fan Radar dashboard →
        </a>
      </div>

      {!summary.connected ? (
        <section className="glass-card p-5">
          <p className="text-sm font-semibold text-white">
            Super Fan Radar isn&apos;t connected for this brand yet
          </p>
          <p className="mt-2 text-xs text-white/60">
            Once this brand is set up as a tenant in Super Fan Radar, its
            elite/core/candidate super fans will show up here.
          </p>
          <a
            href="https://fan-analytics-dashboard.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
          >
            Open Super Fan Radar ↗
          </a>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="Elite" value={summary.counts.elite} />
            <SummaryTile label="Core" value={summary.counts.core} />
            <SummaryTile label="Candidate" value={summary.counts.candidate} />
            <SummaryTile label="Invite-ready" value={summary.inviteReadyCount} />
          </div>

          <section className="glass-card p-5">
            <p className="text-sm font-semibold text-white">Top super fans</p>
            <p className="mt-1 text-xs text-white/60">
              Ranked by Super Fan Index (0-100).
            </p>
            <div className="mt-3 space-y-2">
              {summary.topFans.length === 0 && (
                <p className="text-xs text-white/50">No fans scored yet.</p>
              )}
              {summary.topFans.map((f, i) => (
                <div
                  key={`${f.username}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-white/40">#{i + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-white">{f.username}</p>
                      <p className="text-xs text-white/50">{f.platform}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {f.outreach_opt_in && (
                      <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs text-sky-200">
                        Invite-ready
                      </span>
                    )}
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${TIER_STYLES[f.tier] ?? TIER_STYLES.NONE}`}
                    >
                      {f.tier}
                    </span>
                    <span className="text-sm font-semibold text-white">{f.index}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
      <p className="text-xs uppercase tracking-widest text-white/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value.toLocaleString()}</p>
    </div>
  );
}
