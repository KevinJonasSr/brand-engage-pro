import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Send a single SMS to a member via Twilio. Tier-gated by default — only
 * Gold/Platinum members receive SMS so the channel stays signal, not spam.
 *
 * The caller is responsible for higher-level opt-in checks (preferences
 * table, quiet hours). This module only enforces:
 *   1. Twilio is configured
 *   2. Fan has a phone + sms_opted_in
 *   3. Fan tier ≥ Gold (unless `bypassTierGate` is true)
 *
 * Returns { sent, suppressionReason } so the caller can record the
 * audit log entry with the right reason.
 */

const TIER_RANK: Record<string, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
  founder: 3, // founders == platinum tier for gating
};

export interface SendSmsResult {
  sent: boolean;
  suppressionReason?:
    | "twilio_not_configured"
    | "no_phone"
    | "not_opted_in"
    | "tier_gate"
    | "send_failed";
  error?: string;
}

export async function sendSmsToFan(opts: {
  memberId: string;
  body: string;
  /** If true, skip the Gold-tier gate (e.g., RSVP confirmations to anyone with SMS opt-in). */
  bypassTierGate?: boolean;
}): Promise<SendSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const defaultFrom = process.env.TWILIO_DEFAULT_FROM;
  if (!accountSid || !authToken || (!messagingServiceSid && !defaultFrom)) {
    return { sent: false, suppressionReason: "twilio_not_configured" };
  }

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("id, phone, sms_opted_in, current_tier")
    .eq("id", opts.memberId)
    .maybeSingle();

  if (!member) return { sent: false, suppressionReason: "no_phone" };
  if (!member.phone) return { sent: false, suppressionReason: "no_phone" };
  if (!member.sms_opted_in) return { sent: false, suppressionReason: "not_opted_in" };

  if (!opts.bypassTierGate) {
    const rank = TIER_RANK[(member.current_tier as string) ?? "bronze"] ?? 0;
    if (rank < TIER_RANK.gold) {
      return { sent: false, suppressionReason: "tier_gate" };
    }
  }

  // 10DLC compliance: include STOP unless body already mentions it
  const body =
    opts.body +
    (opts.body.toUpperCase().includes("STOP") ? "" : " Reply STOP to opt out.");

  try {
    const { default: twilio } = await import("twilio");
    const client = twilio(accountSid, authToken);
    await client.messages.create({
      to: member.phone as string,
      body,
      ...(messagingServiceSid
        ? { messagingServiceSid }
        : { from: defaultFrom as string }),
    });
    return { sent: true };
  } catch (err) {
    console.warn("sendSmsToFan failed for", opts.memberId, err);
    return {
      sent: false,
      suppressionReason: "send_failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
