import type {
  PollOption,
  PredictionTally,
  PredictionType,
} from "@/lib/predictions/types";

interface Props {
  type: PredictionType;
  tally: PredictionTally;
  options: PollOption[];
  /** When set, that option's bar lights up (the viewer's vote, or the
   *  correct answer post-resolution). */
  highlightOptionId?: string | null;
}

/**
 * Pure render component — renders the right tally shape for the prediction
 * type. No data fetching, no client interaction.
 */
export function PredictionTallyView({
  type,
  tally,
  options,
  highlightOptionId,
}: Props) {
  if (tally.total_votes === 0) {
    return <p className="text-xs text-white/55">No votes yet.</p>;
  }

  if (type === "multi") {
    return (
      <ul className="space-y-2">
        {tally.by_option.map((row) => {
          const isHighlight = highlightOptionId === row.option_id;
          return (
            <li key={row.option_id}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className={isHighlight ? "font-semibold text-white" : "text-white/85"}>
                  {row.label}
                  {isHighlight && (
                    <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-200">
                      ✓
                    </span>
                  )}
                </span>
                <span className="text-white/60">
                  {row.count} · {row.pct}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full ${isHighlight ? "bg-emerald-400" : "bg-aurora"}`}
                  style={{ width: `${row.pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  if (type === "numeric" && tally.numeric_summary) {
    return (
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Min" value={String(tally.numeric_summary.min)} />
        <Stat label="Mean" value={String(tally.numeric_summary.mean)} />
        <Stat label="Median" value={String(tally.numeric_summary.median)} />
        <Stat label="Max" value={String(tally.numeric_summary.max)} />
      </dl>
    );
  }

  if (type === "date" && tally.date_buckets.length > 0) {
    const max = Math.max(...tally.date_buckets.map((b) => b.count));
    return (
      <ul className="space-y-1.5">
        {tally.date_buckets.map((b) => {
          const pct = max > 0 ? Math.round((b.count / max) * 100) : 0;
          return (
            <li key={b.date}>
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className="text-white/80">{b.date}</span>
                <span className="text-white/55">×{b.count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full bg-aurora"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-white/45">
        {label}
      </dt>
      <dd className="text-base font-semibold text-white">{value}</dd>
    </div>
  );
}
