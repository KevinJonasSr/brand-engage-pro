"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import { broadcastSms } from "@/lib/broadcast";

export type BroadcastFormResult = {
  ok: boolean;
  smsSent?: number;
  emailSent?: number;
  recipientCount?: number;
  error?: string;
};

/**
 * Send a targeted SMS broadcast to a brand's member segment.
 * Tier filter: "all" | "bronze" | "silver" | "gold" | "platinum"
 *
 * Soft-launch: SMS only. Email broadcast stays disabled until Mailchimp
 * audiences can be scoped by brand/tier (unscoped blasts are unsafe).
 */
export async function sendBroadcast(
  formData: FormData,
): Promise<BroadcastFormResult> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "Unauthorized" };

  const brandSlug = String(formData.get("brand_slug") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const tierFilter = String(formData.get("tier_filter") ?? "all");
  const channelRaw = String(formData.get("channel") ?? "sms");

  if (!brandSlug || !message) {
    return { ok: false, error: "Brand and message are required." };
  }

  // Reject email / both (and any other channel) — do not send email.
  if (channelRaw !== "sms") {
    return {
      ok: false,
      error:
        "Email broadcast is disabled until brand/tier scoping is implemented. Use SMS.",
    };
  }

  // If single-brand admin, ensure they only broadcast to their own brand
  if (!ctx.isSuperAdmin && !ctx.communities.includes(brandSlug)) {
    return { ok: false, error: "You can only broadcast to your own brand." };
  }

  // Apply tier filter — narrow the member list before handing to broadcastSms
  let allowedMemberIds: string[] | null = null;
  if (tierFilter !== "all") {
    const admin = createAdminClient();
    // Tier hierarchy: bronze < silver < gold < platinum
    const tierRank: Record<string, number> = {
      bronze: 0,
      silver: 1,
      gold: 2,
      platinum: 3,
    };
    const minRank = tierRank[tierFilter] ?? 0;
    const allowedTiers = Object.entries(tierRank)
      .filter(([, rank]) => rank >= minRank)
      .map(([slug]) => slug);

    const { data: memberships } = await admin
      .from("member_community_memberships")
      .select("member_id, current_tier")
      .eq("community_id", brandSlug)
      .in("current_tier", allowedTiers);

    allowedMemberIds = (memberships ?? []).map((m) => m.member_id as string);
    if (allowedMemberIds.length === 0) {
      return { ok: false, error: "No members match this tier filter." };
    }
  }

  const tierLabel =
    tierFilter === "all"
      ? ""
      : `[${tierFilter[0].toUpperCase() + tierFilter.slice(1)}+ members] `;

  const result = await broadcastSms({ body: tierLabel + message, brandSlug });
  const smsSent = result.sent;

  // Record in campaigns table for audit trail
  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("campaigns")
    .insert({
      brand_slug: brandSlug,
      title: `Broadcast: ${message.slice(0, 60)}${message.length > 60 ? "…" : ""}`,
      description: `Tier: ${tierFilter} · Channel: sms`,
      created_by: ctx.user.id,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (campaign) {
    await admin.from("campaign_items").insert({
      campaign_id: campaign.id,
      item_kind: "sms",
      ref_id: null,
      metadata: { sent: smsSent, tier_filter: tierFilter },
    });
  }

  return {
    ok: true,
    smsSent,
    emailSent: 0,
    recipientCount: allowedMemberIds?.length ?? smsSent,
  };
}

/** Preview SMS recipient count for a brand + tier combination without sending. */
export async function previewRecipientCount(
  brandSlug: string,
  tierFilter: string,
): Promise<number> {
  const admin = createAdminClient();

  // Get members who follow this brand
  const { data: followers } = await admin
    .from("member_brand_following")
    .select("member_id")
    .eq("brand_slug", brandSlug);

  const followerIds = (followers ?? []).map((f) => f.member_id as string);
  if (followerIds.length === 0) return 0;

  let query = admin
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("sms_opted_in", true)
    .eq("suspended", false)
    .in("id", followerIds);

  if (tierFilter !== "all") {
    const tierRank: Record<string, number> = {
      bronze: 0, silver: 1, gold: 2, platinum: 3,
    };
    const minRank = tierRank[tierFilter] ?? 0;
    const allowedTiers = Object.entries(tierRank)
      .filter(([, r]) => r >= minRank)
      .map(([t]) => t);

    const { data: tieredMems } = await admin
      .from("member_community_memberships")
      .select("member_id")
      .eq("community_id", brandSlug)
      .in("current_tier", allowedTiers);

    const tieredIds = (tieredMems ?? []).map((m) => m.member_id as string);
    query = query.in("id", tieredIds);
  }

  const { count } = await query;
  return count ?? 0;
}
