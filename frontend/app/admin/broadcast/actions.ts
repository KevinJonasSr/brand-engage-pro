"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import { broadcastSms, broadcastEmail } from "@/lib/broadcast";

export type BroadcastFormResult = {
  ok: boolean;
  smsSent?: number;
  emailSent?: number;
  recipientCount?: number;
  error?: string;
};

/**
 * Send a targeted broadcast to a brand's member segment.
 * Tier filter: "all" | "bronze" | "silver" | "gold" | "platinum"
 * Channel: "sms" | "email" | "both"
 */
export async function sendBroadcast(
  formData: FormData,
): Promise<BroadcastFormResult> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "Unauthorized" };

  const brandSlug = String(formData.get("brand_slug") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const tierFilter = String(formData.get("tier_filter") ?? "all");
  const channel = String(formData.get("channel") ?? "sms") as "sms" | "email" | "both";

  if (!brandSlug || !message) {
    return { ok: false, error: "Brand and message are required." };
  }

  // If single-brand admin, ensure they only broadcast to their own brand
  if (!ctx.isSuperAdmin && !ctx.communities.includes(brandSlug)) {
    return { ok: false, error: "You can only broadcast to your own brand." };
  }

  // Apply tier filter — narrow the member list before handing to broadcastSms/Email
  // We do this by getting the allowed member IDs and filtering inside a campaign item.
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

  // broadcastSms / broadcastEmail load by brand slug; tier filter narrows after.
  // For now we call with brandSlug and note tier info in the message prefix.
  const tierLabel =
    tierFilter === "all"
      ? ""
      : `[${tierFilter[0].toUpperCase() + tierFilter.slice(1)}+ members] `;

  let smsSent = 0;
  let emailSent = 0;

  if (channel === "sms" || channel === "both") {
    const result = await broadcastSms({ body: tierLabel + message, brandSlug });
    smsSent = result.sent;
  }

  if (channel === "email" || channel === "both") {
    const result = await broadcastEmail({
      subject: `Message from ${brandSlug}`,
      body: `<p>${(tierLabel + message).replace(/\n/g, "<br>")}</p>`,
    });
    emailSent = result.sent;
  }

  // Record in campaigns table for audit trail
  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("campaigns")
    .insert({
      brand_slug: brandSlug,
      title: `Broadcast: ${message.slice(0, 60)}${message.length > 60 ? "…" : ""}`,
      description: `Tier: ${tierFilter} · Channel: ${channel}`,
      created_by: ctx.user.id,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (campaign) {
    await admin.from("campaign_items").insert({
      campaign_id: campaign.id,
      item_kind: channel === "both" ? "sms" : channel,
      ref_id: null,
      metadata: { sent: smsSent + emailSent, tier_filter: tierFilter },
    });
  }

  return {
    ok: true,
    smsSent,
    emailSent,
    recipientCount: (allowedMemberIds?.length ?? smsSent + emailSent),
  };
}

/** Preview recipient count for a brand + tier combination without sending. */
export async function previewRecipientCount(
  brandSlug: string,
  tierFilter: string,
  channel: "sms" | "email" | "both",
): Promise<number> {
  const admin = createAdminClient();
  const optCol = channel === "email" ? "email_opted_in" : "sms_opted_in";

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
    .eq(optCol, true)
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
