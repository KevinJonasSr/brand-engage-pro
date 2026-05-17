import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { gatherPredictionTally } from "@/lib/predictions/tally";
import {
  predictionPhase,
  formatPredictionCountdown,
  secondsUntilPredictionClose,
} from "@/lib/predictions/types";
import type {
  AwardStrategy,
  PollOption,
  PredictionType,
  PredictionVisibility,
} from "@/lib/predictions/types";
import { ResolvePredictionForm } from "./resolve-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resolve prediction · Admin" };

interface PredictionRow {
  id: string;
  brand_slug: string;
  title: string;
  body: string | null;
  prediction_type: PredictionType | null;
  prediction_closes_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  points_for_correct: number | null;
  visibility: PredictionVisibility;
  numeric_unit: string | null;
  numeric_tolerance: number | null;
  award_strategy: AwardStrategy | null;
  correct_option_id: string | null;
  correct_numeric_value: number | null;
  correct_date_value: string | null;
  show_live_tally: boolean | null;
  allow_vote_changes: boolean | null;
  created_at: string;
}

interface AwardRow {
  member_id: string;
  points: number;
  awarded_at: string;
}

export default async function ResolvePredictionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const adminUser = await getAdminUser();
  if (!adminUser) redirect("/login");

  const { id } = await params;
  const admin = createAdminClient();

  const { data: postRaw } = await admin
    .from("community_posts")
    .select(
      "id, brand_slug, title, body, prediction_type, prediction_closes_at, " +
        "resolved_at, resolved_by, resolution_note, points_for_correct, " +
        "visibility, numeric_unit, numeric_tolerance, award_strategy, " +
        "correct_option_id, correct_numeric_value, correct_date_value, " +
        "show_live_tally, allow_vote_changes, created_at",
    )
    .eq("id", id)
    .eq("kind", "prediction")
    .maybeSingle();

  if (!postRaw) notFound();
  const post = postRaw as unknown as PredictionRow;

  // Fetch options if multi
  let options: PollOption[] = [];
  if (post.prediction_type === "multi") {
    const { data: optRows } = await admin
      .from("community_poll_options")
      .select("id, post_id, label, sort_order")
      .eq("post_id", id)
      .order("sort_order");
    options = ((optRows ?? []) as unknown as PollOption[]) ?? [];
  }

  // Fetch tally
  const tally = await gatherPredictionTally(id);

  // If resolved, fetch award log
  let awards: AwardRow[] = [];
  if (post.resolved_at) {
    const { data: awardRows } = await admin
      .from("prediction_award_log")
      .select("member_id, points, awarded_at")
      .eq("post_id", id);
    awards = ((awardRows ?? []) as unknown as AwardRow[]) ?? [];
  }

  const phase = predictionPhase({
    prediction_closes_at: post.prediction_closes_at,
    resolved_at: post.resolved_at,
  });
  const secsLeft = secondsUntilPredictionClose({
    prediction_closes_at: post.prediction_closes_at,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/55">
            {post.brand_slug} · {post.prediction_type ?? "—"}
          </p>
          <h1
            className="mt-1 text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {post.title}
          </h1>
          {post.body && (
            <p className="mt-2 max-w-prose text-sm text-white/75">{post.body}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <PhaseChip phase={phase} secsLeft={secsLeft} />
            <span className="rounded-full bg-white/5 px-2 py-1 text-white/65">
              {post.points_for_correct ?? 0} pts
            </span>
            {post.visibility !== "public" && (
              <span className="rounded-full bg-white/5 px-2 py-1 text-white/65">
                {post.visibility}
              </span>
            )}
            {post.allow_vote_changes && (
              <span className="rounded-full bg-white/5 px-2 py-1 text-white/55">
                vote changes allowed
              </span>
            )}
            {!post.show_live_tally && (
              <span className="rounded-full bg-white/5 px-2 py-1 text-white/55">
                tally hidden
              </span>
            )}
          </div>
        </div>
        <Link
          href="/admin/predictions"
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/75 hover:bg-white/5"
        >
          ← Back to queue
        </Link>
      </header>

      {/* Live tally summary */}
      {tally && tally.total_votes > 0 && (
        <section className="glass-card rounded-2xl p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/55">
            Tally · {tally.total_votes} vote{tally.total_votes === 1 ? "" : "s"}
          </h2>
          {post.prediction_type === "multi" && tally.by_option.length > 0 && (
            <ul className="space-y-2">
              {tally.by_option.map((row) => (
                <li key={row.option_id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-white/85">{row.label}</span>
                    <span className="text-white/65">
                      {row.count} · {row.pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full bg-aurora"
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {post.prediction_type === "numeric" && tally.numeric_summary && (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Min" value={String(tally.numeric_summary.min)} />
              <Stat label="Mean" value={String(tally.numeric_summary.mean)} />
              <Stat label="Median" value={String(tally.numeric_summary.median)} />
              <Stat label="Max" value={String(tally.numeric_summary.max)} />
            </dl>
          )}
          {post.prediction_type === "date" && tally.date_buckets.length > 0 && (
            <ul className="space-y-1 text-sm">
              {tally.date_buckets.map((b) => (
                <li
                  key={b.date}
                  className="flex items-center justify-between text-white/80"
                >
                  <span>{b.date}</span>
                  <span className="text-white/55">×{b.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Resolve form OR resolved summary */}
      {post.resolved_at ? (
        <section className="glass-card rounded-2xl p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-300">
            Resolved
          </h2>
          <p className="text-sm text-white/75">
            <span className="font-medium text-white">Correct answer:</span>{" "}
            <ResolvedAnswer post={post} options={options} />
          </p>
          {post.resolution_note && (
            <p className="mt-2 text-sm text-white/65">
              <span className="font-medium text-white/80">Note:</span>{" "}
              {post.resolution_note}
            </p>
          )}
          <p className="mt-3 text-xs text-white/55">
            {awards.length} winner{awards.length === 1 ? "" : "s"} ·{" "}
            {awards.reduce((sum, a) => sum + (a.points ?? 0), 0)} pts awarded
          </p>
        </section>
      ) : phase === "open" ? (
        <section className="glass-card rounded-2xl p-5">
          <h2 className="mb-1 text-sm font-semibold text-white">Not yet closeable</h2>
          <p className="text-xs text-white/65">
            Voting is still open
            {secsLeft !== null
              ? ` — closes in ${formatPredictionCountdown(secsLeft)}.`
              : "."}{" "}
            You can still resolve early below if you have the answer.
          </p>
          <div className="mt-4">
            <ResolvePredictionForm
              postId={post.id}
              predictionType={post.prediction_type ?? "multi"}
              options={options}
              numericUnit={post.numeric_unit}
            />
          </div>
        </section>
      ) : (
        <section className="glass-card rounded-2xl p-5">
          <h2 className="mb-1 text-sm font-semibold text-amber-300">
            Awaiting your verdict
          </h2>
          <p className="text-xs text-white/65">
            Voting closed. Provide the correct answer to award points.
          </p>
          <div className="mt-4">
            <ResolvePredictionForm
              postId={post.id}
              predictionType={post.prediction_type ?? "multi"}
              options={options}
              numericUnit={post.numeric_unit}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function PhaseChip({
  phase,
  secsLeft,
}: {
  phase: "open" | "closed" | "resolved";
  secsLeft: number | null;
}) {
  if (phase === "open") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-300">
        Open
        {secsLeft !== null ? ` · closes in ${formatPredictionCountdown(secsLeft)}` : ""}
      </span>
    );
  }
  if (phase === "closed") {
    return (
      <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-300">
        Awaiting resolution
      </span>
    );
  }
  return (
    <span className="rounded-full bg-white/10 px-2 py-1 text-white/60">
      Resolved
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-white/45">
        {label}
      </dt>
      <dd className="text-base font-semibold text-white">{value}</dd>
    </div>
  );
}

function ResolvedAnswer({
  post,
  options,
}: {
  post: PredictionRow;
  options: PollOption[];
}) {
  if (post.prediction_type === "multi") {
    const opt = options.find((o) => o.id === post.correct_option_id);
    return <span>{opt?.label ?? "—"}</span>;
  }
  if (post.prediction_type === "numeric") {
    return (
      <span>
        {post.correct_numeric_value ?? "—"}
        {post.numeric_unit ? ` ${post.numeric_unit}` : ""}
      </span>
    );
  }
  if (post.prediction_type === "date") {
    return <span>{post.correct_date_value ?? "—"}</span>;
  }
  return <span>—</span>;
}
