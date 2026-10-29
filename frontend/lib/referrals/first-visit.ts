import type { SupabaseClient } from "@supabase/supabase-js";
// Relative, extension-full imports (like lib/streaks/touch.ts) so the unit
// tests can load this module under plain `node --test` without the "@/"
// alias. Both modules depend only on @supabase/supabase-js.
import { createAdminClient } from "../supabase/admin.ts";
import { awardPoints } from "../points/award.ts";

/** Points the referrer earns once the friend they invited makes a first visit. */
export const REFERRAL_QUALIFIED_POINTS = 150;
/** Points the new member gets at signup for joining through an invite link. */
export const REFERRAL_WELCOME_POINTS = 50;

/** Ledger key for the friend's welcome bonus: one per referred member. */
export function referralWelcomeSourceRef(referredId: string): string {
  return `referral-welcome:${referredId}`;
}

/** Ledger key for the referrer's payout: one per referral row. */
export function referralQualifiedSourceRef(referralId: string): string {
  return `referral-qualified:${referralId}`;
}

export type PendingReferral = {
  id: string;
  referrer_id: string;
  referred_id: string | null;
  community_id: string | null;
  qualified_at: string | null;
};

/**
 * Pure decision: should this check-in qualify the referral?
 *
 * Only the member's very first check-in anywhere counts (`checkinCount` is
 * the all-time total *after* the new row was inserted, so 1 = first), and a
 * row that already carries `qualified_at` is never re-qualified. The ledger
 * source_ref is the second guard against a lost race.
 */
export function shouldQualifyReferral(
  referral: PendingReferral | null | undefined,
  checkinCount: number,
): boolean {
  if (!referral) return false;
  if (referral.qualified_at) return false;
  return checkinCount === 1;
}

export type QualifyResult =
  | { qualified: true; referralId: string; referrerId: string }
  | { qualified: false; reason: "no_referral" | "already_qualified" | "not_first_visit" | "not_awarded" | "error" };

/**
 * Called after a check-in row was written for `memberId`. If the member was
 * referred and this is their first check-in ever, stamp `qualified_at`,
 * flip the row to 'verified' (which fires the existing 0010/0065 in-app
 * "Referral confirmed" notification and the 0004 referral badges for the
 * referrer) and pay the referrer through the ledger.
 *
 * Never throws: recordCheckin fires this without awaiting the result.
 */
export async function qualifyReferralOnFirstVisit(
  memberId: string,
  brandSlug: string,
  client?: SupabaseClient,
): Promise<QualifyResult> {
  try {
    const admin = client ?? createAdminClient();

    const { data: referral, error: refErr } = await admin
      .from("referrals")
      .select("id, referrer_id, referred_id, community_id, qualified_at")
      .eq("referred_id", memberId)
      .maybeSingle();
    if (refErr) {
      console.warn("qualifyReferralOnFirstVisit: referral lookup failed", refErr.message);
      return { qualified: false, reason: "error" };
    }
    if (!referral) return { qualified: false, reason: "no_referral" };
    const pending = referral as PendingReferral;
    if (pending.qualified_at) return { qualified: false, reason: "already_qualified" };

    const { count, error: countErr } = await admin
      .from("checkins")
      .select("*", { count: "exact", head: true })
      .eq("member_id", memberId);
    if (countErr) {
      console.warn("qualifyReferralOnFirstVisit: checkin count failed", countErr.message);
      return { qualified: false, reason: "error" };
    }
    if (!shouldQualifyReferral(pending, count ?? 0)) {
      return { qualified: false, reason: "not_first_visit" };
    }

    // Claim the row first. The `.is("qualified_at", null)` filter makes two
    // concurrent first check-ins (or a replay) race for a single update.
    const now = new Date().toISOString();
    const { data: claimed, error: claimErr } = await admin
      .from("referrals")
      .update({
        qualified_at: now,
        status: "verified",
        verified_at: now,
        points_awarded: REFERRAL_QUALIFIED_POINTS,
      })
      .eq("id", pending.id)
      .is("qualified_at", null)
      .select("id");
    if (claimErr) {
      console.warn("qualifyReferralOnFirstVisit: claim failed", claimErr.message);
      return { qualified: false, reason: "error" };
    }
    if (!claimed || claimed.length === 0) {
      return { qualified: false, reason: "already_qualified" };
    }

    const { awarded } = await awardPoints(admin, {
      memberId: pending.referrer_id,
      delta: REFERRAL_QUALIFIED_POINTS,
      source: "referral",
      sourceRef: referralQualifiedSourceRef(pending.id),
      note: `Your invite made their first visit at ${brandSlug}`,
      communityId: pending.community_id ?? undefined,
    });
    if (!awarded) return { qualified: false, reason: "not_awarded" };

    // No push NotificationType covers referrals (see lib/notifications/types.ts);
    // the referrer's in-app "Referral confirmed" card comes from the
    // notify_referral_joined trigger (0010/0065) on the status flip above.

    return { qualified: true, referralId: pending.id, referrerId: pending.referrer_id };
  } catch (err) {
    console.warn("qualifyReferralOnFirstVisit failed (non-blocking):", err);
    return { qualified: false, reason: "error" };
  }
}
