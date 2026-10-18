import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMAIL_SUBJECT_MAX } from "./email-campaign.ts";
import {
  EMAIL_ALLOWLIST_HOLD,
  buildDefaultReminderCopy,
  reminderCopyIsSendable,
  reminderNeedsEmailRetry,
  scheduledEmailGateOpen,
} from "./reminder-copy.ts";

const event = {
  title: "Bourbon night",
  detail: "Bring a glass.",
  starts_at: "2026-10-21T23:00:00.000Z",
  location: "Nellie's",
  url: "https://www.brandengagepro.com/brands/nellies",
  brand_name: "Nellie's",
};

const openEnv = {
  EMAIL_SENDING_ENABLED: "1",
  BEP_MAILING_ADDRESS: "1 Main St, Nashville, TN 37201",
  MAILCHIMP_TRANSACTIONAL_API_KEY: "md-test",
};

describe("buildDefaultReminderCopy", () => {
  it("names the clock time in the email and keeps the copy sendable", () => {
    const copy = buildDefaultReminderCopy(event, "reminder_24h");
    assert.match(copy.email, /7:00 PM EDT/);
    assert.match(copy.email, /tomorrow/);
    assert.equal(copy.sms.includes("EDT"), false);
    assert.equal(reminderCopyIsSendable(copy), true);
  });

  it("clamps a long title instead of failing the send", () => {
    const copy = buildDefaultReminderCopy(
      { ...event, title: "A".repeat(200), detail: "D".repeat(20_000) },
      "reminder_1h",
    );
    assert.ok(copy.subject.length <= EMAIL_SUBJECT_MAX);
    assert.equal(reminderCopyIsSendable(copy), true);
  });
});

describe("reminder retry", () => {
  it("retries a blocked send and not a Mandrill rejection", () => {
    assert.equal(reminderNeedsEmailRetry(null), false);
    assert.equal(
      reminderNeedsEmailRetry({
        error: "email: Email sending is off. Set EMAIL_SENDING_ENABLED=1 to send.",
        recipients_email: 0,
      }),
      true,
    );
    assert.equal(
      reminderNeedsEmailRetry({
        error: `email: ${EMAIL_ALLOWLIST_HOLD}`,
        recipients_email: 0,
      }),
      true,
    );
    assert.equal(
      reminderNeedsEmailRetry({
        error: "email: Mandrill send failed: 500",
        recipients_email: 0,
      }),
      false,
    );
    assert.equal(
      reminderNeedsEmailRetry({
        error: "email: Email sending is off.",
        recipients_email: 2,
      }),
      false,
    );
    assert.equal(reminderNeedsEmailRetry({ error: "sms: Twilio not configured", recipients_email: 0 }), false);
  });

  it("keeps scheduled email held while the allowlist is set", () => {
    assert.equal(scheduledEmailGateOpen({}), false);
    assert.equal(scheduledEmailGateOpen(openEnv), true);
    assert.equal(
      scheduledEmailGateOpen({ ...openEnv, BEP_EMAIL_ALLOWLIST: "you@brandengagepro.com" }),
      false,
    );
    assert.equal(scheduledEmailGateOpen({ ...openEnv, BEP_EMAIL_ALLOWLIST: "nope" }), false);
  });
});
