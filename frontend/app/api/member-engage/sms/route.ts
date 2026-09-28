import { NextResponse } from "next/server";
import twilio from "twilio";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { welcomeSmsRateLimiter } from "@/lib/rate-limit";
import { WELCOME_SMS_BODY, welcomeSmsTarget } from "@/lib/welcome-sms";

export const runtime = "nodejs";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const defaultFrom = process.env.TWILIO_DEFAULT_FROM;

/**
 * Sends the fixed welcome text to the signed-in member's own stored phone.
 *
 * The request body is ignored: no phone number or wording is accepted from
 * the client. The member must have ticked the SMS consent box during
 * onboarding (sms_opted_in plus a stamped consent time).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await welcomeSmsRateLimiter.check(`welcome-sms:${user.id}`)).success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  if (!accountSid || !authToken || (!messagingServiceSid && !defaultFrom)) {
    return NextResponse.json(
      { error: "Text messages are not set up yet." },
      { status: 503 },
    );
  }

  try {
    const admin = createAdminClient();
    const { data: member, error: memberErr } = await admin
      .from("members")
      .select("phone, sms_opted_in, consent_accepted_at, suspended")
      .eq("id", user.id)
      .maybeSingle();
    if (memberErr) {
      console.error("welcome sms: failed to load member", memberErr);
      return NextResponse.json({ error: "Unable to send text." }, { status: 500 });
    }

    const target = welcomeSmsTarget(member);
    if (!target.ok) {
      return NextResponse.json({ error: target.error }, { status: target.status });
    }

    const client = twilio(accountSid, authToken);
    const config: Parameters<typeof client.messages.create>[0] = {
      to: target.to,
      body: WELCOME_SMS_BODY,
    };
    if (messagingServiceSid) {
      config.messagingServiceSid = messagingServiceSid;
    } else if (defaultFrom) {
      config.from = defaultFrom;
    }

    await client.messages.create(config);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("welcome sms: Twilio send failed", error);
    return NextResponse.json({ error: "Unable to send text." }, { status: 500 });
  }
}
