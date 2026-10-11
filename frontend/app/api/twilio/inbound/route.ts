import { NextResponse } from "next/server";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  HELP_REPLY,
  START_NO_CONSENT_REPLY,
  START_REPLY,
  STOP_REPLY,
  parseSmsKeyword,
  phoneLookupVariants,
} from "@/lib/sms-compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_APP_URL = "https://www.brandengagepro.com";

/**
 * Twilio inbound SMS webhook — carrier compliance for STOP / HELP / START.
 *
 * Configure in Twilio Console:
 *   Messaging Service → Integration → Incoming Messages
 *   URL: https://<your-domain>/api/twilio/inbound (POST, x-www-form-urlencoded)
 *
 * We respond with TwiML so Twilio sends the correct reply back to the member.
 * Keywords and reply text live in lib/sms-compliance.ts. STOP and START keep
 * members.sms_opted_in and notification_preferences.sms_enabled in step.
 * Anything else gets a silent ack (empty TwiML).
 */
function twimlResponse(message: string | null): NextResponse {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

type Admin = ReturnType<typeof createAdminClient>;

async function findMembersByPhone(admin: Admin, from: string) {
  const variants = phoneLookupVariants(from);
  if (variants.length === 0) return [];
  const { data, error } = await admin
    .from("members")
    .select("id, consent_accepted_at")
    .in("phone", variants);
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; consent_accepted_at: string | null }>;
}

/** Set the SMS switch on both the member row and their notification prefs. */
async function setSmsConsent(admin: Admin, memberIds: string[], enabled: boolean) {
  if (memberIds.length === 0) return;
  const { error } = await admin
    .from("members")
    .update({ sms_opted_in: enabled })
    .in("id", memberIds);
  if (error) throw error;
  const { error: prefsError } = await admin
    .from("notification_preferences")
    .upsert(
      memberIds.map((member_id) => ({ member_id, sms_enabled: enabled })),
      { onConflict: "member_id" },
    );
  if (prefsError) throw prefsError;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();

    // Verify Twilio signature to prevent spoofed STOP/START from arbitrary callers.
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    if (twilioAuthToken) {
      const sig = request.headers.get("x-twilio-signature") ?? "";
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL;
      const webhookUrl = `${appUrl}/api/twilio/inbound`;
      const params: Record<string, string> = {};
      for (const [k, v] of form.entries()) params[k] = String(v);
      if (!twilio.validateRequest(twilioAuthToken, sig, webhookUrl, params)) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }

    const from = String(form.get("From") ?? "");
    const keyword = parseSmsKeyword(String(form.get("Body") ?? ""));

    if (!from || !keyword) return twimlResponse(null);
    if (keyword === "help") return twimlResponse(HELP_REPLY);

    const admin = createAdminClient();
    const members = await findMembersByPhone(admin, from);

    if (keyword === "stop") {
      // Twilio also blocks the number at the carrier level; we reply and
      // record it so our own sends skip this member too.
      await setSmsConsent(admin, members.map((m) => m.id), false);
      return twimlResponse(STOP_REPLY);
    }

    // START: only members who accepted the terms on the site can opt back in.
    const consented = members.filter((m) => m.consent_accepted_at);
    if (consented.length === 0) return twimlResponse(START_NO_CONSENT_REPLY);
    await setSmsConsent(admin, consented.map((m) => m.id), true);
    return twimlResponse(START_REPLY);
  } catch (err) {
    // Never 500 on this endpoint — Twilio will retry and duplicate messages.
    console.error("twilio inbound failed:", err);
    return twimlResponse(null);
  }
}
