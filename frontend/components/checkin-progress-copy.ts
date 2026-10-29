/**
 * Pure copy helpers for the check-in success moment. Kept free of React and
 * server imports so the client page can import them and `node --test` can
 * load them directly.
 *
 * `CheckinProgress` mirrors the `progress` field of POST /api/checkin
 * (lib/data/checkins.ts) — duplicated as a type here so this module stays
 * importable from client components without touching server-only code.
 */
export type CheckinProgress = {
  spendablePoints: number;
  visitCount: number;
  streakDays: number;
  stampCard: {
    stampsEarned: number;
    stampsRequired: number;
    rewardTitle: string;
    visitsRemaining: number;
    justCompleted: boolean;
  } | null;
  nextTier: { name: string; pointsToNext: number } | null;
};

export function formatPts(n: number): string {
  return `${Math.max(0, Math.round(n)).toLocaleString()} pts`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The one-line headline, e.g.
 * "+25 pts · 3 of 5 stamps · 2 more visits to your Free entrée".
 * Segments are dropped when their data is missing so the line never reads
 * "+0 pts · undefined".
 */
export function checkinHeadline(
  pointsAwarded: number,
  progress: CheckinProgress | null,
): string {
  const parts: string[] = [];
  if (pointsAwarded > 0) parts.push(`+${formatPts(pointsAwarded)}`);

  const card = progress?.stampCard;
  if (card) {
    if (card.justCompleted) {
      parts.push(`${card.stampsRequired} of ${card.stampsRequired} stamps`);
      parts.push(`${card.rewardTitle} unlocked`);
    } else {
      parts.push(`${card.stampsEarned} of ${card.stampsRequired} stamps`);
      parts.push(
        `${plural(card.visitsRemaining, "more visit", "more visits")} to your ${card.rewardTitle}`,
      );
    }
  } else if (progress && progress.visitCount > 0) {
    parts.push(plural(progress.visitCount, "visit here", "visits here"));
  }

  return parts.join(" · ");
}

/** Secondary facts under the headline, each a short phrase. */
export function checkinDetails(progress: CheckinProgress | null): string[] {
  if (!progress) return [];
  const out: string[] = [];
  out.push(`${formatPts(progress.spendablePoints)} to spend`);
  if (progress.streakDays > 1) {
    out.push(`${plural(progress.streakDays, "day", "day")} streak`);
  }
  if (progress.stampCard && progress.visitCount > 0) {
    out.push(plural(progress.visitCount, "visit here", "visits here"));
  }
  if (progress.nextTier && progress.nextTier.pointsToNext > 0) {
    out.push(`${formatPts(progress.nextTier.pointsToNext)} to ${progress.nextTier.name}`);
  }
  return out;
}

/** 0–100 fill for the stamp progress bar; a just-completed card shows full. */
export function stampBarPercent(card: CheckinProgress["stampCard"]): number | null {
  if (!card || card.stampsRequired <= 0) return null;
  if (card.justCompleted) return 100;
  return Math.round(
    Math.min(100, Math.max(0, (card.stampsEarned / card.stampsRequired) * 100)),
  );
}
