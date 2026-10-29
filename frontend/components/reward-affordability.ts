/**
 * Pure affordability maths for a reward card. `balance` is the viewer's
 * spendable points (null when signed out or unknown — the card then keeps
 * its original behaviour and lets the redeem RPC be the judge).
 */
export type RewardAffordability =
  | { known: false }
  | {
      known: true;
      canAfford: boolean;
      /** Points still needed; 0 when affordable. */
      shortfall: number;
      /** balance / cost as a 0–100 integer, capped. */
      percent: number;
    };

export function rewardAffordability(
  pointCost: number,
  balance: number | null | undefined,
): RewardAffordability {
  if (balance === null || balance === undefined || !Number.isFinite(balance)) {
    return { known: false };
  }
  const cost = Math.max(0, Number(pointCost) || 0);
  const have = Math.max(0, balance);
  const canAfford = have >= cost;
  const percent = cost === 0 ? 100 : Math.round(Math.min(100, (have / cost) * 100));
  return {
    known: true,
    canAfford,
    shortfall: canAfford ? 0 : cost - have,
    percent,
  };
}

/** Short hint under the cost, or null when there is nothing useful to say. */
export function affordabilityCopy(a: RewardAffordability): string | null {
  if (!a.known) return null;
  if (a.canAfford) return "You can redeem this";
  return `You're ${a.shortfall.toLocaleString()} pts away`;
}
