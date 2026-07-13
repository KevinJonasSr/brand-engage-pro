import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Award points to a member — the single authoritative function for all
 * point grants in Brand Engage Pro.
 *
 * Writes to three places atomically (best-effort):
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

  // 1. Ledger entry (audit trail)
  await admin.from("points_ledger").insert({
    fan_id: memberId,
    delta,
    source,
    community_id: communityId,
    ...(sourceRef ? { source_ref: sourceRef } : {}),
    ...(note ? { note } : {}),
  });

  // 2. members.total_points (legacy denormalised column)
  const { data: memberRow } = await admin
    .from("members")
    .select("total_points")
    .eq("id", memberId)
    .maybeSingle();
  await admin
    .from("members")
    .update({ total_points: ((memberRow?.total_points as number) ?? 0) + delta })
    .eq("id", memberId);

  // 3. member_community_memberships.total_points (UI source of truth)
  const { data: membership } = await admin
    .from("member_community_memberships")
    .select("total_points")
    .eq("member_id", memberId)
    .eq("community_id", communityId)
    .maybeSingle();

  if (membership) {
    await admin
      .from("member_community_memberships")
      .update({
        total_points: ((membership.total_points as number) ?? 0) + delta,
      })
      .eq("member_id", memberId)
      .eq("community_id", communityId);
  }
}
