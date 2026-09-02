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
