"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessBrand, getAdminContext, requireAdminContext, requireBrandAccess } from "@/lib/admin";
import { broadcastBrandEmail, broadcastSms, type BroadcastResult } from "@/lib/broadcast";
import { validateEmailCampaign } from "@/lib/email-campaign";

const SMS_LIMIT = 160;

export type BroadcastFormResult = {
  ok: boolean;
  smsSent?: number;
  /** Texts held back because it was quiet hours for the member. */
  smsSkippedQuietHours?: number;
  emailSent?: number;
  recipientCount?: number;
  error?: string;
};

const CHANNELS = ["sms", "email", "both"] as const;
type BroadcastChannel = (typeof CHANNELS)[number];

function parseChannel(raw: string): BroadcastChannel | null {
  return (CHANNELS as readonly string[]).includes(raw) ? (raw as BroadcastChannel) : null;
}

/**
 * Send a targeted broadcast to a brand's member segment by SMS, email or both.
 * Tier filter: "all" | "bronze" | "silver" | "gold" | "platinum"
 *
 * Email goes one message per member through Mailchimp Transactional, so it
 * only reaches this brand's opted-in followers (see broadcastBrandEmail).
 */
export async function sendBroadcast(
  formData: FormData,
): Promise<BroadcastFormResult> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, error: "Unauthorized" };

  // The brand comes from the admin's current brand (the community switcher),
  // not a hard-coded form value. An explicit form value is still checked below.
  const brandSlug =
    String(formData.get("brand_slug") ?? "").trim() ||
    (ctx.currentCommunityId ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const tierFilter = String(formData.get("tier_filter") ?? "all");
  const channel = parseChannel(String(formData.get("channel") ?? "sms"));

  if (!brandSlug || !message) {
    return { ok: false, error: "Brand and message are required." };
  }
  if (!channel) return { ok: false, error: "Pick SMS, email or both." };
  const sendsSms = channel !== "email";
  const sendsEmail = channel !== "sms";
  if (sendsSms && message.length > SMS_LIMIT) {
    return { ok: false, error: `SMS messages must be ${SMS_LIMIT} characters or fewer.` };
  }
  if (sendsEmail) {
    const invalid = validateEmailCampaign({ subject, body: message });
    if (invalid) return { ok: false, error: invalid };
  }

  // Brand admins may only broadcast to their own brand.
  if (!canAccessBrand(ctx, brandSlug)) {
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

  // allowedMemberIds is null for "all", so the whole brand audience is used.
  const empty: BroadcastResult = { attempted: 0, sent: 0, failed: 0, recipients: 0 };
  const [sms, email] = await Promise.all([
    sendsSms
      ? broadcastSms({ body: tierLabel + message, brandSlug, memberIds: allowedMemberIds })
      : Promise.resolve(empty),
    sendsEmail
      ? broadcastBrandEmail({ subject, body: message, brandSlug, memberIds: allowedMemberIds })
      : Promise.resolve(empty),
  ]);

  // Record in campaigns table for audit trail
  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("campaigns")
    .insert({
      brand_slug: brandSlug,
      community_id: brandSlug,
      title: `Broadcast: ${(subject || message).slice(0, 60)}${(subject || message).length > 60 ? "…" : ""}`,
      description: `Tier: ${tierFilter} · Channel: ${channel}`,
      created_by: ctx.user.id,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (campaign) {
    const items = [
      sendsSms && {
        campaign_id: campaign.id,
        item_kind: "sms",
        ref_id: null,
        metadata: {
          sent: sms.sent,
          failed: sms.failed,
          recipients: sms.recipients,
          skipped_quiet_hours: sms.skippedQuietHours ?? 0,
          tier_filter: tierFilter,
          error: sms.error ?? null,
        },
      },
      sendsEmail && {
        campaign_id: campaign.id,
        item_kind: "email",
        ref_id: null,
        metadata: {
          subject,
          sent: email.sent,
          failed: email.failed,
          recipients: email.recipients,
          tier_filter: tierFilter,
          error: email.error ?? null,
        },
      },
    ].filter(Boolean);
    await admin.from("campaign_items").insert(items);
  }

  const errors = [sms.error, email.error].filter(Boolean);
  const anySent = sms.sent + email.sent > 0;
  if (errors.length > 0 && !anySent) {
    return { ok: false, error: errors.join(" ") };
  }

  return {
    ok: true,
    smsSent: sms.sent,
    smsSkippedQuietHours: sms.skippedQuietHours ?? 0,
    emailSent: email.sent,
    recipientCount: Math.max(sms.recipients, email.recipients),
    error: errors.length > 0 ? errors.join(" ") : undefined,
  };
}

/** Preview recipient count for a brand + tier + channel without sending. */
export async function previewRecipientCount(
  brandSlug: string,
  tierFilter: string,
  channel: string = "sms",
): Promise<number> {
  // Server actions are public endpoints: check the caller before counting.
  const ctx = await requireAdminContext();
  requireBrandAccess(ctx, brandSlug);
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
    .eq(channel === "email" ? "email_opted_in" : "sms_opted_in", true)
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
