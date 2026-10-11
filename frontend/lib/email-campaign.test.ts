import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_BODY_MAX,
  EMAIL_SUBJECT_MAX,
  UNSUB_MERGE_TAG,
  buildCampaignEmail,
  buildMandrillMessage,
  chunk,
  countMandrillResults,
  escapeHtml,
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

describe("buildCampaignEmail", () => {
  const email = buildCampaignEmail({
    subject: "Bourbon night <RSVP>",
    body: "Join us *|EMAIL|*\nSee you there",
    brandName: "Nellie's",
  });

  it("escapes the subject and body in HTML", () => {
    assert.match(email.html, /Bourbon night &lt;RSVP&gt;/);
    assert.ok(!email.html.includes("<RSVP>"));
  });

  it("names the brand and carries the unsubscribe tag in both versions", () => {
    assert.match(email.html, /Nellie&#39;s/);
    assert.ok(email.html.includes(`href="${UNSUB_MERGE_TAG}"`));
    assert.match(email.text, /joined Nellie's on Brand Engage Pro/);
    assert.ok(email.text.includes(`Unsubscribe: ${UNSUB_MERGE_TAG}`));
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
      { email: "a@x.test", unsubUrl: "https://u/a" },
      { email: "b@x.test", unsubUrl: "https://u/b" },
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
      { rcpt: "a@x.test", vars: [{ name: "UNSUB_URL", content: "https://u/a" }] },
      { rcpt: "b@x.test", vars: [{ name: "UNSUB_URL", content: "https://u/b" }] },
    ]);
    assert.equal(msg.merge, true);
  });

  it("sets subject, sender and reply-to", () => {
    assert.equal(msg.subject, "Hello");
    assert.equal(msg.from_name, "Nellie's");
    assert.deepEqual(msg.headers, { "Reply-To": "support@brandengagepro.com" });
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
