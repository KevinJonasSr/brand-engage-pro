import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  EMAIL_BODY_MAX,
  EMAIL_SUBJECT_MAX,
  UNSUB_MERGE_TAG,
  buildCampaignEmail,
  buildMandrillMessage,
  chunk,
  countMandrillResults,
  escapeHtml,
  appBaseUrl,
  emailOnAllowlist,
  fromAddress,
  isMarketingEmailEnabled,
  isOneClickUnsubscribeBody,
  listUnsubscribeHeaders,
  mailingAddress,
  marketingEmailBlockReason,
  oneClickUnsubscribeUrl,
  parseEmailAllowlist,
  stripMergeTags,
  unsubscribeUrl,
  validateEmailCampaign,
} from "./email-campaign.ts";

describe("escapeHtml", () => {
  it("escapes markup characters", () => {
    assert.equal(escapeHtml(`<a href="x">Tom & 'Jo'</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jo&#39;&lt;/a&gt;");
  });
});

describe("stripMergeTags", () => {
  it("breaks merge tags typed by an admin", () => {
    assert.equal(stripMergeTags("Hi *|EMAIL|*"), "Hi * |EMAIL| *");
  });

  it("leaves normal text alone", () => {
    assert.equal(stripMergeTags("Half off | today *only*"), "Half off | today *only*");
  });
});

describe("validateEmailCampaign", () => {
  it("accepts a normal subject and body", () => {
    assert.equal(validateEmailCampaign({ subject: "Fall menu", body: "It is here." }), null);
  });

  it("requires both fields", () => {
    assert.match(validateEmailCampaign({ subject: " ", body: "x" }) ?? "", /subject is required/);
    assert.match(validateEmailCampaign({ subject: "x", body: "" }) ?? "", /body is required/);
  });

  it("caps the lengths", () => {
    assert.match(
      validateEmailCampaign({ subject: "a".repeat(EMAIL_SUBJECT_MAX + 1), body: "x" }) ?? "",
      /subject must be/,
    );
    assert.match(
      validateEmailCampaign({ subject: "x", body: "a".repeat(EMAIL_BODY_MAX + 1) }) ?? "",
      /body must be/,
    );
  });
});

describe("unsubscribeUrl", () => {
  it("builds the email unsubscribe link", () => {
    assert.equal(
      unsubscribeUrl("https://www.brandengagepro.com/", "abc123"),
      "https://www.brandengagepro.com/unsubscribe?token=abc123&channel=email",
    );
  });

  it("encodes the token", () => {
    assert.match(unsubscribeUrl("https://x.test", "a&b"), /token=a%26b&/);
  });
});

describe("env example", () => {
  const envExample = readFileSync(
    fileURLToPath(new URL("../.env.example", import.meta.url)),
    "utf8",
  );

  it("documents the off switch and does not turn marketing email on", () => {
    assert.match(envExample, /^EMAIL_SENDING_ENABLED=0$/m);
    assert.doesNotMatch(envExample, /EMAIL_SENDING_ENABLED=1/);
    assert.doesNotMatch(envExample, /MAILCHIMP_BROADCAST_ENABLED=1/);
    assert.match(envExample, /BEP_MAILING_ADDRESS/);
    assert.match(envExample, /^# BEP_EMAIL_ALLOWLIST=$/m);
    assert.doesNotMatch(envExample, /^BEP_EMAIL_ALLOWLIST=/m);
  });
});

describe("marketing email gate", () => {
  const env = {
    EMAIL_SENDING_ENABLED: "1",
    BEP_MAILING_ADDRESS: "1 Main St, Nashville, TN 37201",
    MAILCHIMP_TRANSACTIONAL_API_KEY: "md-test",
  };

  it("stays off unless EMAIL_SENDING_ENABLED is exactly 1", () => {
    assert.equal(isMarketingEmailEnabled({}), false);
    assert.equal(isMarketingEmailEnabled({ EMAIL_SENDING_ENABLED: "true" }), false);
    assert.equal(isMarketingEmailEnabled({ EMAIL_SENDING_ENABLED: "0" }), false);
    assert.equal(isMarketingEmailEnabled({ EMAIL_SENDING_ENABLED: "1" }), true);
  });

  it("refuses to send when the key is set but the switch or address is missing", () => {
    assert.match(
      marketingEmailBlockReason({ MAILCHIMP_TRANSACTIONAL_API_KEY: "md-test" }) ?? "",
      /EMAIL_SENDING_ENABLED=1/,
    );
    assert.match(
      marketingEmailBlockReason({
        EMAIL_SENDING_ENABLED: "1",
        MAILCHIMP_TRANSACTIONAL_API_KEY: "md-test",
      }) ?? "",
      /BEP_MAILING_ADDRESS/,
    );
    assert.equal(marketingEmailBlockReason(env), null);
    assert.equal(mailingAddress({ BEP_MAILING_ADDRESS: "  1 Main St  " }), "1 Main St");
    assert.equal(mailingAddress({}), null);
  });

  it("blocks a From address Mandrill cannot sign", () => {
    assert.match(
      marketingEmailBlockReason({ ...env, BEP_EMAIL_FROM: "hello@gmail.com" }) ?? "",
      /BEP_EMAIL_FROM/,
    );
    assert.equal(fromAddress({}), "hello@brandengagepro.com");
    assert.equal(marketingEmailBlockReason({ ...env, BEP_EMAIL_FROM: "news@mail.brandengagepro.com" }), null);
  });

  it("fails closed on a bad allowlist and ignores an empty one", () => {
    assert.match(
      marketingEmailBlockReason({ ...env, BEP_EMAIL_ALLOWLIST: "not-an-email" }) ?? "",
      /BEP_EMAIL_ALLOWLIST/,
    );
    assert.equal(marketingEmailBlockReason({ ...env, BEP_EMAIL_ALLOWLIST: "  " }), null);
    const parsed = parseEmailAllowlist({ BEP_EMAIL_ALLOWLIST: "A@Example.com, b@example.com" });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.emails?.size, 2);
      assert.equal(emailOnAllowlist("a@example.com", parsed.emails), true);
      assert.equal(emailOnAllowlist("other@example.com", parsed.emails), false);
      assert.equal(emailOnAllowlist("other@example.com", null), true);
    }
  });

  it("recognizes the RFC 8058 one-click body", () => {
    assert.equal(isOneClickUnsubscribeBody("List-Unsubscribe=One-Click"), true);
    assert.equal(isOneClickUnsubscribeBody("List-Unsubscribe=One-Click\r\n"), true);
    assert.equal(isOneClickUnsubscribeBody(""), false);
    assert.equal(isOneClickUnsubscribeBody("token=abc"), false);
  });
});

describe("appBaseUrl", () => {
  it("pins preview and apex hosts to www", () => {
    assert.equal(appBaseUrl({}), "https://www.brandengagepro.com");
    assert.equal(
      appBaseUrl({ NEXT_PUBLIC_APP_URL: "https://brand-engage-pro.vercel.app" }),
      "https://www.brandengagepro.com",
    );
    assert.equal(
      appBaseUrl({ NEXT_PUBLIC_APP_URL: "https://brandengagepro.com" }),
      "https://www.brandengagepro.com",
    );
    assert.equal(appBaseUrl({ NEXT_PUBLIC_APP_URL: "http://localhost:3000/" }), "http://localhost:3000");
  });
});

describe("one-click unsubscribe url", () => {
  it("points at the POST endpoint", () => {
    assert.equal(
      oneClickUnsubscribeUrl("https://www.brandengagepro.com/", "abc"),
      "https://www.brandengagepro.com/api/unsubscribe/one-click?token=abc",
    );
    assert.deepEqual(
      listUnsubscribeHeaders("https://www.brandengagepro.com/api/unsubscribe/one-click?token=abc"),
      {
        "List-Unsubscribe": "<https://www.brandengagepro.com/api/unsubscribe/one-click?token=abc>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    );
  });
});

describe("buildCampaignEmail", () => {
  const email = buildCampaignEmail({
    subject: "Bourbon night <RSVP>",
    body: "Join us *|EMAIL|*\nSee you there",
    brandName: "Nellie's",
    postalAddress: "1 Main St, Nashville, TN 37201",
  });

  it("escapes the subject and body in HTML", () => {
    assert.match(email.html, /Bourbon night &lt;RSVP&gt;/);
    assert.ok(!email.html.includes("<RSVP>"));
  });

  it("names the brand and carries the unsubscribe tag and mailing address", () => {
    assert.match(email.html, /Nellie&#39;s/);
    assert.ok(email.html.includes(`href="${UNSUB_MERGE_TAG}"`));
    assert.match(email.html, /mc:disable-tracking/);
    assert.match(email.html, /1 Main St, Nashville, TN 37201/);
    assert.match(email.text, /joined Nellie's on Brand Engage Pro/);
    assert.ok(email.text.includes(`Unsubscribe: ${UNSUB_MERGE_TAG}`));
    assert.match(email.text, /1 Main St, Nashville, TN 37201/);
  });

  it("does not let admin text merge member data", () => {
    assert.ok(!email.html.includes("*|EMAIL|*"));
    assert.ok(!email.text.includes("*|EMAIL|*"));
  });
});

describe("chunk", () => {
  it("splits into batches", () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunk([], 100), []);
  });

  it("rejects a size below 1", () => {
    assert.throws(() => chunk([1], 0));
  });
});

describe("buildMandrillMessage", () => {
  const msg = buildMandrillMessage({
    subject: " Hello ",
    html: "<p>x</p>",
    text: "x",
    fromEmail: "hello@brandengagepro.com",
    fromName: "Nellie's",
    replyTo: "support@brandengagepro.com",
    recipients: [
      { email: "a@x.test", unsubUrl: "https://u/a", oneClickUrl: "https://oc/a" },
      { email: "b@x.test", unsubUrl: "https://u/b", oneClickUrl: "https://oc/b" },
    ],
    tags: ["campaign", "nellies"],
  });

  it("hides recipients from each other", () => {
    assert.equal(msg.preserve_recipients, false);
    assert.deepEqual(msg.to, [
      { email: "a@x.test", type: "to" },
      { email: "b@x.test", type: "to" },
    ]);
  });

  it("gives each member their own unsubscribe link", () => {
    assert.deepEqual(msg.merge_vars, [
      {
        rcpt: "a@x.test",
        vars: [
          { name: "UNSUB_URL", content: "https://u/a" },
          { name: "UNSUB_ONECLICK", content: "https://oc/a" },
        ],
      },
      {
        rcpt: "b@x.test",
        vars: [
          { name: "UNSUB_URL", content: "https://u/b" },
          { name: "UNSUB_ONECLICK", content: "https://oc/b" },
        ],
      },
    ]);
    assert.equal(msg.merge, true);
  });

  it("sets subject, sender, reply-to and one-click headers", () => {
    assert.equal(msg.subject, "Hello");
    assert.equal(
      buildMandrillMessage({
        subject: "Hello\nBcc: evil@example.com",
        html: "<p>x</p>",
        text: "x",
        fromEmail: "hello@brandengagepro.com",
        fromName: "Nellie's\nKitchen",
        replyTo: "support@brandengagepro.com",
        recipients: [{ email: "a@x.test", unsubUrl: "https://u/a", oneClickUrl: "https://oc/a" }],
        tags: ["campaign"],
      }).subject,
      "Hello Bcc: evil@example.com",
    );
    assert.equal(
      buildMandrillMessage({
        subject: "Hello",
        html: "<p>x</p>",
        text: "x",
        fromEmail: "hello@brandengagepro.com",
        fromName: "Nellie's\nKitchen",
        replyTo: "support@brandengagepro.com",
        recipients: [{ email: "a@x.test", unsubUrl: "https://u/a", oneClickUrl: "https://oc/a" }],
        tags: ["campaign"],
      }).from_name,
      "Nellie's Kitchen",
    );
    assert.equal(msg.from_name, "Nellie's");
    assert.equal(msg.headers["Reply-To"], "support@brandengagepro.com");
    assert.equal(msg.headers["List-Unsubscribe"], "<*|UNSUB_ONECLICK|*>");
    assert.equal(msg.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  });
});

describe("countMandrillResults", () => {
  it("counts sent and queued as delivered", () => {
    assert.deepEqual(
      countMandrillResults([
        { status: "sent" },
        { status: "queued" },
        { status: "rejected" },
        { status: "invalid" },
      ]),
      { sent: 2, failed: 2 },
    );
  });

  it("handles a non-array response", () => {
    assert.deepEqual(countMandrillResults({ status: "error" }), { sent: 0, failed: 0 });
  });
});

describe("every Mandrill send stays behind the gate", () => {
  const broadcast = readFileSync(fileURLToPath(new URL("./broadcast.ts", import.meta.url)), "utf8");
  const digest = readFileSync(
    fileURLToPath(new URL("../app/api/cron/weekly-member-digest/route.ts", import.meta.url)),
    "utf8",
  );
  const reminders = readFileSync(fileURLToPath(new URL("./reminders.ts", import.meta.url)), "utf8");

  it("checks marketingEmailBlockReason before the Mandrill call", () => {
    const brandSend = broadcast.slice(broadcast.indexOf("export async function broadcastBrandEmail"));
    const digestSend = digest.slice(digest.indexOf("async function sendDigestEmail"));
    for (const src of [brandSend, digestSend]) {
      const gate = src.indexOf("marketingEmailBlockReason(");
      const send = src.search(/fetch\(|mandrillapp\.com\/api\/1\.0\/messages\/send/);
      assert.ok(gate !== -1 && send !== -1 && gate < send);
    }
    assert.match(digest, /if \(blocked\)/);
    assert.match(reminders, /broadcastBrandEmail\(/);
    assert.doesNotMatch(reminders, /mandrillapp\.com/);
  });

  it("does not read the retired broadcast flag", () => {
    assert.doesNotMatch(broadcast, /MAILCHIMP_BROADCAST_ENABLED/);
    assert.doesNotMatch(digest, /MAILCHIMP_BROADCAST_ENABLED/);
    assert.doesNotMatch(reminders, /MAILCHIMP_BROADCAST_ENABLED/);
  });
});
