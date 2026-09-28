/**
 * Welcome text for members who ticked the SMS consent box.
 *
 * The wording is fixed on the server. Nothing from the request body is
 * placed in the message, and it only goes to the phone number stored on
 * the signed-in member's own profile.
 */
export const WELCOME_SMS_BODY =
  "Welcome to Brand Engage Pro! You're signed up for texts about rewards, " +
  "specials, and events from the places you join. " +
  "Reply HELP for help. Reply STOP to opt out. Msg & data rates may apply.";

const E164 = /^\+[1-9]\d{7,14}$/;

export function isE164Phone(value: unknown): value is string {
  return typeof value === "string" && E164.test(value);
}

export type WelcomeSmsMember = {
  phone?: string | null;
  sms_opted_in?: boolean | null;
  consent_accepted_at?: string | null;
  suspended?: boolean | null;
};

export type WelcomeSmsDecision =
  | { ok: true; to: string }
  | { ok: false; status: 400 | 403 | 404; error: string };

/** Decide whether this member may get the welcome text, and where to. */
export function welcomeSmsTarget(member: WelcomeSmsMember | null): WelcomeSmsDecision {
  if (!member) return { ok: false, status: 404, error: "Profile not found." };
  if (member.suspended) return { ok: false, status: 403, error: "Account is suspended." };
  if (member.sms_opted_in !== true || !member.consent_accepted_at) {
    return { ok: false, status: 403, error: "Text messages are not turned on for this account." };
  }
  // Allow the common "+1 (615) 555-0123" style, but send plain E.164.
  const phone = (member.phone ?? "").replace(/[\s().-]/g, "");
  if (!isE164Phone(phone)) {
    return { ok: false, status: 400, error: "The phone number on your profile is not valid." };
  }
  return { ok: true, to: phone };
}
