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
 * omitted, we resolve the member's primary membership — the earliest row
 * in member_community_memberships by joined_at. A member with no
 * membership gets a ledger row with community_id null (the 0046 backfill
 * query sweeps those up); there is no brand-specific fallback.
 *
 * Idempotency: pass a deterministic `sourceRef` (e.g. `checkin:<brand>:
 * <member>:<date>`). The 0059 unique index rejects a repeat, the totals are
 * left alone, and the result reports `awarded: false` so callers can tell a
 * retry or a lost race apart from a fresh grant.
 */
export interface AwardPointsResult {
  /** True when a new ledger row was written (and totals moved). */
  awarded: boolean;
  /** Points actually credited by this call: `delta` when awarded, else 0. */
  delta: number;
  /** Community the ledger row was (or would have been) scoped to; null
   *  when the member has no membership and none was passed. */
  communityId: string | null;
}

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
    communityId?: string | null;
  },
): Promise<AwardPointsResult> {
  if (!communityId) {
    communityId = await resolvePrimaryCommunityId(admin, memberId);
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
    return { awarded: false, delta: 0, communityId };
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
  return { awarded: true, delta, communityId };
}

/**
 * The member's primary community: their earliest membership by joined_at.
 * Null when they have none (or the read fails) — callers then write an
 * unscoped ledger row instead of guessing a brand.
 */
async function resolvePrimaryCommunityId(
  admin: SupabaseClient,
  memberId: string,
): Promise<string | null> {
  const { data: memberships, error } = await admin
    .from("member_community_memberships")
    .select("community_id, joined_at")
    .eq("member_id", memberId)
    .order("joined_at", { ascending: true })
    .limit(1);
  if (error) {
    console.warn("awardPoints: membership lookup failed", error);
    return null;
  }
  const first = (memberships ?? [])[0] as { community_id?: string | null } | undefined;
  return first?.community_id ?? null;
}
