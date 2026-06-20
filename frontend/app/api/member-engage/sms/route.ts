import { NextResponse } from "next/server";
import twilio from "twilio";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type SmsPayload = {
  phone: string;
  firstName?: string;
  interest?: string;
};

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const defaultFrom = process.env.TWILIO_DEFAULT_FROM;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!accountSid || !authToken || (!messagingServiceSid && !defaultFrom)) {
    return NextResponse.json(
      { error: "Twilio credentials are not configured" },
      { status: 500 }
    );
  }

  try {
    const { phone, firstName, interest } = (await request.json()) as SmsPayload;

    if (!phone) {
      return NextResponse.json({ error: "Phone number required" }, { status: 400 });
    }
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 });
    }

    const client = twilio(accountSid, authToken);
    // Welcome text — points at the first point-earning action so the member has
    // a reason to open the app right away. Includes carrier-required opt-out.
    const body =
      `Hey ${firstName ?? "member"}! 🎶 Welcome to Brand Engage Pro` +
      (interest ? ` — we'll keep an ear out for ${interest}.` : ".") +
      ` Earn your first 100 pts: follow an brand, RSVP to an event, or share the app. ` +
      `Reply HELP for help. STOP to opt out. Msg&data rates may apply.`;

    const config: Parameters<typeof client.messages.create>[0] = {
      to: phone,
      body,
    };

    if (messagingServiceSid) {
      config.messagingServiceSid = messagingServiceSid;
    } else if (defaultFrom) {
      config.from = defaultFrom;
    }

    await client.messages.create(config);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send Twilio opt-in:", error);
    return NextResponse.json(
      { error: "Unable to send confirmation text." },
      { status: 500 }
    );
  }
}
