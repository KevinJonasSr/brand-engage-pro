import { createAdminClient } from "@/lib/supabase/admin";

/** Founding 100 is a free first-join badge. Premium is a separate paid club. */
export const FOUNDING_CAP_DEFAULT = 100;

export type FoundingClaims = {
  communityId: string;
  cap: number;
  claimed: number;
  remaining: number;
  isFull: boolean;
};

/**
 * Single source of truth for Founding 100 counters.
 *
 * Counts free founding claims (`is_founder = true`) toward the community
 * cap. Does not count paid-club subscription rows. Paid club access
 * ($10/mo / $99/yr) is a separate product.
 */
export async function getFoundingClaims(
  communityId: string,
): Promise<FoundingClaims> {
  const admin = createAdminClient();
  const [{ data: community }, { count, error }] = await Promise.all([
    admin
      .from("communities")
      .select("founder_cap")
      .eq("slug", communityId)
      .maybeSingle(),
    admin
      .from("member_community_memberships")
      .select("member_id", { count: "exact", head: true })
      .eq("community_id", communityId)
      .eq("is_founder", true),
  ]);

  const cap = (community?.founder_cap as number) ?? FOUNDING_CAP_DEFAULT;
  const claimed = error || count == null ? 0 : count;
  const remaining = Math.max(0, cap - claimed);
  return {
    communityId,
    cap,
    claimed,
    remaining,
    isFull: remaining === 0,
  };
}

/** Claim a free Founding 100 slot on join. No-op when the cap is hit. */
export async function claimFreeFoundingOnJoin(
  memberId: string,
  communityId: string,
): Promise<number | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_founder_slot", {
    p_member_id: memberId,
    p_community_id: communityId,
  });
  if (error) {
    console.warn("claimFreeFoundingOnJoin failed", communityId, error.message);
    return null;
  }
  return typeof data === "number" && data > 0 ? data : null;
}
