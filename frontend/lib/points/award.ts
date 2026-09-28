import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Award points to a member — the single authoritative function for all
 * point grants in Brand Engage Pro.
 *
 * Writes to three places:
 *   1. points_ledger                        — immutable audit trail
 *   2. members.total_points                 — legacy denormalised total
 *   3. member_community_memberships.total_points — UI source of truth
 *
 * Pass the admin client so this works in server actions, API routes,
 * and cron jobs alike.
 *
 * Multi-tenancy: callers should pass communityId explicitly. When
 * omitted, we resolve from the member's memberships — unambiguous when
 * they belong to exactly one community; otherwise falls back to
 * "nellies" (BEP's original single-tenant default).
 */
export async function awardPoints(
  admin: SupabaseClient,
  {
    memberId,
    delta,
    source,
    sourceRef,
    note,
    communityId,
  }: {
    memberId: string;
    delta: number;
    source: string;
    sourceRef?: string;
    note?: string;
    communityId?: string;
  },
): Promise<void> {
  if (!communityId) {
    const { data: memberships } = await admin
      .from("member_community_memberships")
      .select("community_id")
      .eq("member_id", memberId)
      .limit(2);
    communityId =
      memberships && memberships.length === 1
        ? (memberships[0].community_id as string)
        : "nellies";
  }

  // 1. Ledger entry (audit trail). The 0059 unique index rejects a repeat
  // source_ref; totals only move when the ledger row was written.
  const { error: ledgerErr } = await admin.from("points_ledger").insert({
    member_id: memberId,
    delta,
    source,
    community_id: communityId,
    ...(sourceRef ? { source_ref: sourceRef } : {}),
    ...(note ? { note } : {}),
  });
  if (ledgerErr) {
    if (ledgerErr.code !== "23505") {
      console.warn("awardPoints: ledger insert failed", ledgerErr);
    }
    return;
  }

  // 2 + 3. Both totals move in one atomic UPDATE each (migration 0061),
  // so two awards landing together can no longer overwrite each other.
  const { error: totalErr } = await admin.rpc("add_member_points", {
    p_member_id: memberId,
    p_delta: delta,
    p_community_id: communityId,
  });
  if (totalErr) {
    console.warn("awardPoints: add_member_points failed", totalErr);
  }
}
