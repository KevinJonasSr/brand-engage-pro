/**
 * Spendable points = SUM(points_ledger.delta) for the member.
 *
 * members.total_points and member_community_memberships.total_points drift
 * (welcome badge on a leftover community, RSVP writes one store and not the
 * other, missing membership row). Member-facing UI must use the ledger.
 */

export function sumLedgerDeltas(
  rows: Array<{ delta?: number | null }>,
): number {
  let total = 0;
  for (const row of rows) {
    const n = Number(row.delta);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

/**
 * Lifetime points = SUM(points_ledger.delta) WHERE delta > 0. This is what
 * tier is based on (migration 0082): redeeming a reward spends points but
 * never moves a member back down a tier.
 */
export function sumPositiveLedgerDeltas(
  rows: Array<{ delta?: number | null }>,
): number {
  let total = 0;
  for (const row of rows) {
    const n = Number(row.delta);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

/**
 * Tier progress from lifetime points. `tiers` may be in any order. Returns
 * the next tier above `lifetimePoints` and the distance to it, or nulls at
 * the top of the ladder.
 */
export function tierProgress<T extends { min_points: number }>(
  tiers: T[],
  lifetimePoints: number,
): { next_tier: T | null; points_to_next_tier: number | null } {
  const next_tier =
    tiers
      .filter((t) => t.min_points > lifetimePoints)
      .sort((a, b) => a.min_points - b.min_points)[0] ?? null;
  return {
    next_tier,
    points_to_next_tier: next_tier
      ? Math.max(0, next_tier.min_points - lifetimePoints)
      : null,
  };
}
