import type { StampCardData } from "@/lib/data/stamp-card";

/**
 * Visual stamp card shown to signed-in members on a brand page.
 * Stamps fill left-to-right; completed rounds show a "Reward earned!" banner.
 */
export default function StampCard({
  data,
  accentFrom,
  accentTo,
}: {
  data: StampCardData;
  brandSlug: string;
  accentFrom: string;
  accentTo: string;
}) {
  const { stampsRequired, rewardTitle, rewardDescription, stampsInCurrentRound, completedRounds } =
    data;

  const justCompleted = stampsInCurrentRound === 0 && completedRounds > 0;

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-wide text-iron/60">Stamp Card</p>
          <p className="mt-0.5 text-base font-semibold">{rewardTitle}</p>
          {rewardDescription && (
            <p className="mt-0.5 text-xs text-iron/55">{rewardDescription}</p>
          )}
        </div>
        {completedRounds > 0 && (
          <span
            className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-iron"
            style={{ backgroundImage: `linear-gradient(90deg, ${accentFrom}, ${accentTo})` }}
          >
            {completedRounds}× earned
          </span>
        )}
      </div>

      {/* Stamp grid */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(stampsRequired, 5)}, 1fr)` }}
        aria-label={`${stampsInCurrentRound} of ${stampsRequired} stamps collected`}
      >
        {Array.from({ length: stampsRequired }).map((_, i) => {
          const filled = i < stampsInCurrentRound;
          return (
            <div
              key={i}
              aria-hidden
              className={`flex aspect-square items-center justify-center rounded-xl border text-lg transition ${
                filled
                  ? "border-transparent text-iron"
                  : "border-iron/15 bg-parchment/20 text-iron/20"
              }`}
              style={
                filled
                  ? { backgroundImage: `linear-gradient(135deg, ${accentFrom}, ${accentTo})` }
                  : undefined
              }
            >
              {filled ? "✓" : "·"}
            </div>
          );
        })}
      </div>

      {justCompleted ? (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-sage-ink text-center">
          🎉 Reward ready — show this to your server!
        </p>
      ) : (
        <p className="text-xs text-iron/50 text-center">
          {stampsRequired - stampsInCurrentRound} more{" "}
          {stampsRequired - stampsInCurrentRound === 1 ? "visit" : "visits"} to earn{" "}
          <span className="text-iron/70">{rewardTitle}</span>
        </p>
      )}

      {/* Check-in needs the signed token in the store QR code, so there is
          no link here. A plain link would fail once the secret is set. */}
      <p className="w-full rounded-full border border-iron/20 py-2 text-center text-sm font-medium text-iron/80">
        Scan the QR code at the counter to check in
      </p>
    </div>
  );
}
