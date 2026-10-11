import { daysToNextMilestone } from "@/lib/streaks/touch";

/**
 * Streak visual on Member Home.
 *
 * Renders a fire-emoji + day-count card with a small "next milestone"
 * progress hint. Color intensity scales with streak length so longer
 * streaks visually dominate.
 *
 * Special states:
 *   - 0 days   → "Start your streak today" CTA-style
 *   - 1-6 days → cool teal ramp
 *   - 7-29     → orange (Week One unlocked)
 *   - 30-99    → amber (Month One unlocked)
 *   - 100-364  → red (Centurion)
 *   - 365+     → purple/gold (Year One)
 */

interface StreakTileProps {
  currentStreakDays: number;
  longestStreakDays: number;
  pointsAwardedThisVisit: number;
  newMilestone: number | null;
}

function tierForStreak(days: number): {
  bg: string;
  ring: string;
  textAccent: string;
  flame: string;
  label: string | null;
} {
  if (days >= 365)
    return {
      bg: "from-purple-500/30 via-amber-500/20 to-rose-500/30",
      ring: "ring-amber-300/50",
      textAccent: "text-aurora-ink",
      flame: "👑",
      label: "Year One",
    };
  if (days >= 100)
    return {
      bg: "from-rose-500/30 via-orange-500/25 to-amber-500/20",
      ring: "ring-rose-300/40",
      textAccent: "text-ember",
      flame: "🔥🔥🔥",
      label: "Centurion",
    };
  if (days >= 30)
    return {
      bg: "from-amber-500/30 via-orange-500/20 to-rose-500/15",
      ring: "ring-amber-300/40",
      textAccent: "text-aurora-ink",
      flame: "🔥🔥",
      label: "Month One",
    };
  if (days >= 7)
    return {
      bg: "from-orange-500/25 via-amber-500/15 to-aurora/15",
      ring: "ring-orange-300/30",
      textAccent: "text-aurora-ink",
      flame: "🔥",
      label: "Week One",
    };
  if (days >= 1)
    return {
      bg: "from-aurora/20 via-cyan-500/15 to-emerald-500/15",
      ring: "ring-aurora/30",
      textAccent: "text-aurora-ink",
      flame: "🔥",
      label: null,
    };
  return {
    bg: "from-iron/5 via-iron/3 to-iron/0",
    ring: "ring-iron/10",
    textAccent: "text-iron/50",
    flame: "🪵",
    label: null,
  };
}

export default function StreakTile({
  currentStreakDays,
  longestStreakDays,
  pointsAwardedThisVisit,
  newMilestone,
}: StreakTileProps) {
  const tier = tierForStreak(currentStreakDays);
  const nextMilestone = daysToNextMilestone(currentStreakDays);
  const showLongestPR =
    longestStreakDays > 0 &&
    longestStreakDays > currentStreakDays;

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${tier.bg} p-5 ring-1 ${tier.ring} transition`}
    >
      {/* Subtle glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full blur-3xl opacity-40"
        style={{
          background:
            "radial-gradient(circle at center, rgba(252,165,55,0.6), transparent 70%)",
        }}
      />

      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-parchment/30 text-3xl ring-1 ring-iron/10"
            aria-hidden
          >
            {tier.flame}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-iron/55">
              {currentStreakDays === 0 ? "Daily streak" : "Day streak"}
            </p>
            <p className="mt-1 text-3xl font-semibold leading-none text-iron">
              {currentStreakDays}
              <span className="ml-1 text-base font-medium text-iron/55">
                day{currentStreakDays === 1 ? "" : "s"}
              </span>
            </p>
            {tier.label && (
              <p className={`mt-1 text-xs font-semibold ${tier.textAccent}`}>
                {tier.label} unlocked
              </p>
            )}
            {currentStreakDays === 0 && (
              <p className="mt-1 text-xs text-iron/55">
                Visit Brand Engage tomorrow to start your streak.
              </p>
            )}
          </div>
        </div>

        {nextMilestone && currentStreakDays > 0 && (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-iron/55">
              Next milestone
            </p>
            <p className="mt-1 text-sm font-semibold text-iron">
              Day {nextMilestone.next}
            </p>
            <p className="text-xs text-iron/55">
              {nextMilestone.daysRemaining} day
              {nextMilestone.daysRemaining === 1 ? "" : "s"} away
            </p>
          </div>
        )}
      </div>

      {/* Bottom row: today's bonus + longest-streak PR */}
      {(pointsAwardedThisVisit > 0 || showLongestPR) && (
        <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-iron/10 pt-3 text-xs text-iron/65">
          {pointsAwardedThisVisit > 0 && (
            <span>
              {newMilestone ? (
                <>
                  🎉 <span className="font-semibold text-iron">
                    +{pointsAwardedThisVisit} pts
                  </span>{" "}
                  — Day {newMilestone} milestone hit!
                </>
              ) : (
                <>
                  +{pointsAwardedThisVisit} pts for showing up today
                </>
              )}
            </span>
          )}
          {showLongestPR && (
            <span className="text-iron/45">
              Longest streak: {longestStreakDays} days
            </span>
          )}
        </div>
      )}
    </div>
  );
}
