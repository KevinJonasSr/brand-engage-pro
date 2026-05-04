"use client";

import { useEffect, useState } from "react";
import {
  dropPhase,
  formatCountdown,
  isInFinalHour,
  secondsUntilNextChange,
  type DropTimingFields,
} from "@/lib/drops";

/**
 * DropCountdown — live ticking pill that renders inside a reward card or
 * banner. Three visual states:
 *
 *   - Upcoming (drops_at > now)        → cyan/aurora "Drops in 2h 14m"
 *   - Live, normal (>1h remaining)     → amber "Ends in 11h 32m"
 *   - Live, final hour (≤1h remaining) → rose/red "47m 12s left"
 *   - Expired                          → dim "Expired" — caller usually
 *                                         hides the card entirely
 *
 * The component picks an appropriate update cadence based on remaining
 * time so we don't spend battery ticking once a second on a 5-day drop:
 *   > 1 day      → tick every 60 minutes
 *   > 1 hour     → tick every 60 seconds
 *   ≤ 1 hour     → tick every 1 second
 */

interface DropCountdownProps {
  reward: DropTimingFields;
  /** Optional className wrapper. */
  className?: string;
  /** When true, renders nothing for non-drops + expired drops. Default true. */
  hideWhenIdle?: boolean;
}

function pickInterval(secondsLeft: number): number {
  if (secondsLeft <= 60 * 60) return 1_000;        // ≤1h: tick every 1s
  if (secondsLeft <= 24 * 60 * 60) return 60_000;  // ≤1d: tick every 60s
  return 60 * 60 * 1_000;                          // >1d: tick every 60m
}

export default function DropCountdown({
  reward,
  className = "",
  hideWhenIdle = true,
}: DropCountdownProps) {
  // Avoid SSR/hydration drift — start with the static initial second
  // calculation, then re-derive on each tick.
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const initialSecondsLeft = secondsUntilNextChange(reward, new Date()) ?? 0;
    const interval = pickInterval(initialSecondsLeft);
    const id = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(id);
    // We only need to reset the interval when the reward identity changes;
    // ticks of `now` should not retrigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reward.is_drop, reward.drops_at, reward.expires_at]);

  const phase = dropPhase(reward, now);
  const secondsLeft = secondsUntilNextChange(reward, now);

  if (hideWhenIdle && (phase === "not-a-drop" || phase === "expired")) {
    return null;
  }

  if (phase === "expired") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-wide text-white/45 ${className}`}
      >
        Expired
      </span>
    );
  }

  if (phase === "upcoming" && secondsLeft !== null) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-aurora/30 bg-aurora/10 px-2.5 py-1 text-[11px] font-semibold text-aurora ${className}`}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-aurora" aria-hidden />
        Drops in {formatCountdown(secondsLeft)}
      </span>
    );
  }

  if (phase === "live" && secondsLeft !== null) {
    if (isInFinalHour(reward, now)) {
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-200 ${className}`}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" aria-hidden />
          {formatCountdown(secondsLeft)} left
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200 ${className}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden />
        Ends in {formatCountdown(secondsLeft)}
      </span>
    );
  }

  return null;
}
