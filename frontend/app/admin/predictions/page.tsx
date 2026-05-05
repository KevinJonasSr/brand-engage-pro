import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  predictionPhase,
  formatPredictionCountdown,
  secondsUntilPredictionClose,
} from "@/lib/predictions/types";
import type { PredictionType } from "@/lib/predictions/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Predictions · Admin · Brand Engage Pro" };

/**
 * Admin queue: all predictions across all brands, grouped by phase.
 *
 * Sections:
 *   - Awaiting resolution (closes_at passed, resolved_at null)  ← top priority
 *   - Open (still accepting votes)
 *   - Resolved (last 30 days)
 */
interface PredictionQueueRow {
  id: string;
  brand_slug: string;
  title: string;
  prediction_type: PredictionType | null;
  prediction_closes_at: string | null;
  resolved_at: string | null;
  points_for_correct: number | null;
  visibility: string;
  created_at: string;
}

export default async function AdminPredictionsPage() {
  const adminUser = await getAdminUser();
  if (!adminUser) redirect("/login");

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("community_posts")
    .select(
      "id, brand_slug, title, prediction_type, prediction_closes_at, " +
        "resolved_at, points_for_correct, visibility, created_at",
    )
    .eq("kind", "prediction")
    .order("created_at", { ascending: false })
    .limit(200);

  const all = (rows ?? []) as PredictionQueueRow[];
  const now = new Date();

  const awaiting = all.filter(
    (p) =>
      !p.resolved_at &&
      p.prediction_closes_at &&
      new Date(p.prediction_closes_at as string).getTime() <= now.getTime(),
  );
  const open = all.filter((p) => predictionPhase(
    {
      prediction_closes_at: p.prediction_closes_at as string | null,
      resolved_at: p.resolved_at as string | null,
    },
    now,
  ) === "open");
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const resolved = all.filter(
    (p) =>
      p.resolved_at &&
      new Date(p.resolved_at as string).getTime() >= cutoff.getTime(),
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Predictions
          </h1>
          <p className="mt-1 text-sm text-white/65">
            Member-engagement polls with a correct answer revealed later.
            Awaiting-resolution rows are closed and need your verdict.
          </p>
        </div>
        <Link
          href="/admin/predictions/new"
          className="rounded-lg bg-aurora px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90"
        >
          + New prediction
        </Link>
      </header>

      <Section title={`Awaiting resolution · ${awaiting.length}`} accent="amber">
        {awaiting.length === 0 ? (
          <Empty msg="Nothing waiting. All closed predictions have been resolved." />
        ) : (
          <ul className="space-y-3">
            {awaiting.map((p) => (
              <PredictionRow
                key={p.id as string}
                row={p}
                phase="closed"
                href={`/admin/predictions/${p.id}`}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Open · ${open.length}`} accent="emerald">
        {open.length === 0 ? (
          <Empty msg="No open predictions. Click + New prediction to start one." />
        ) : (
          <ul className="space-y-3">
            {open.map((p) => (
              <PredictionRow
                key={p.id as string}
                row={p}
                phase="open"
                href={`/admin/predictions/${p.id}`}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Resolved (last 30d) · ${resolved.length}`} accent="white">
        {resolved.length === 0 ? (
          <Empty msg="No predictions resolved in the past 30 days." />
        ) : (
          <ul className="space-y-3">
            {resolved.map((p) => (
              <PredictionRow
                key={p.id as string}
                row={p}
                phase="resolved"
                href={`/admin/predictions/${p.id}`}
              />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

interface PredictionRowProps {
  row: {
    id: string;
    brand_slug: string;
    title: string;
    prediction_type: PredictionType | null;
    prediction_closes_at: string | null;
    resolved_at: string | null;
    points_for_correct: number | null;
    visibility: string;
    created_at: string;
  };
  phase: "open" | "closed" | "resolved";
  href: string;
}

function PredictionRow({ row, phase, href }: PredictionRowProps) {
  const secsLeft =
    phase === "open"
      ? secondsUntilPredictionClose({ prediction_closes_at: row.prediction_closes_at })
      : null;

  return (
    <li className="glass-card rounded-2xl p-4">
      <Link href={href} className="block">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-white">{row.title}</p>
            <p className="mt-1 text-xs text-white/55">
              {row.brand_slug} · {row.prediction_type ?? "—"} ·{" "}
              {row.points_for_correct ?? 0} pts
              {row.visibility !== "public" ? ` · ${row.visibility}` : ""}
            </p>
          </div>
          <div className="text-right text-xs">
            {phase === "open" && secsLeft !== null && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-300">
                Closes in {formatPredictionCountdown(secsLeft)}
              </span>
            )}
            {phase === "closed" && (
              <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-300">
                Resolve →
              </span>
            )}
            {phase === "resolved" && (
              <span className="rounded-full bg-white/10 px-2 py-1 text-white/60">
                Resolved
              </span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent: "amber" | "emerald" | "white";
  children: React.ReactNode;
}) {
  const dot =
    accent === "amber"
      ? "bg-amber-300"
      : accent === "emerald"
        ? "bg-emerald-300"
        : "bg-white/40";
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/55">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <p className="rounded-2xl border border-white/10 bg-white/3 p-4 text-sm text-white/55">
      {msg}
    </p>
  );
}
