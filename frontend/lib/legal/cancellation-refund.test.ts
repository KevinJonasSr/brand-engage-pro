import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CANCELLATION_REFUND_MD } from "./cancellation-refund.ts";
import {
  isPublishedPolicyContent,
  policyForDisplay,
} from "./policy-display.ts";

const privacyPage = readFileSync(
  fileURLToPath(new URL("../../app/privacy/page.tsx", import.meta.url)),
  "utf8",
);
const termsPage = readFileSync(
  fileURLToPath(new URL("../../app/terms/page.tsx", import.meta.url)),
  "utf8",
);
const cookiePage = readFileSync(
  fileURLToPath(new URL("../../app/cookie-policy/page.tsx", import.meta.url)),
  "utf8",
);
const cancellationPage = readFileSync(
  fileURLToPath(new URL("../../app/cancellation-refund/page.tsx", import.meta.url)),
  "utf8",
);
const cancellationSource = readFileSync(
  fileURLToPath(new URL("./cancellation-refund.ts", import.meta.url)),
  "utf8",
);
const publishedSource = readFileSync(
  fileURLToPath(new URL("./published-policies.ts", import.meta.url)),
  "utf8",
);
const legalPage = readFileSync(
  fileURLToPath(new URL("../../app/legal/page.tsx", import.meta.url)),
  "utf8",
);

const fepLeftovers = [
  /\bFEP\b/,
  /Founding Fan/,
  /founder slot/i,
  /returning fans/i,
  /fanengagepro\.com/i,
  /memberengage\.app/i,
  /LEGAL-REVIEW/,
];

describe("published cancellation and refund policy", () => {
  it("keeps the product name and names Fan Engage Pro LLC as the company", () => {
    assert.match(CANCELLATION_REFUND_MD, /your Brand Engage Pro subscription/);
    assert.match(
      CANCELLATION_REFUND_MD,
      /Fan Engage Pro LLC does not offer refunds for partial billing periods/,
    );
    assert.doesNotMatch(
      CANCELLATION_REFUND_MD.replaceAll("Fan Engage Pro LLC", ""),
      /Fan Engage/,
    );
    assert.match(CANCELLATION_REFUND_MD, /raymond@jonasgroup\.com/);
    assert.match(CANCELLATION_REFUND_MD, /mailto:raymond@jonasgroup\.com/);
    for (const leftover of fepLeftovers) {
      assert.doesNotMatch(CANCELLATION_REFUND_MD, leftover);
    }
  });

  it("keeps FEP clauses that still need counsel, outside the page text", () => {
    assert.match(CANCELLATION_REFUND_MD, /Cancelling your subscription/);
    assert.match(
      CANCELLATION_REFUND_MD,
      /does not offer refunds for partial billing periods/,
    );
    assert.match(CANCELLATION_REFUND_MD, /within 30 days of the charge/);
    assert.match(CANCELLATION_REFUND_MD, /you keep Premium access until then/);
    assert.match(
      CANCELLATION_REFUND_MD,
      /Chargebacks without prior contact may result in account suspension/,
    );
    assert.match(CANCELLATION_REFUND_MD, /## 4\. Disputes/);
    assert.match(CANCELLATION_REFUND_MD, /## 5\. Changes to this policy/);
    assert.doesNotMatch(CANCELLATION_REFUND_MD, /## 3\./);
    assert.match(cancellationSource, /LEGAL-REVIEW: Billing/);
    assert.match(cancellationSource, /LEGAL-REVIEW: Contracting entity/);
    assert.match(
      cancellationSource,
      /Raymond confirmed Fan Engage Pro LLC on 2026-10-01/,
    );
    assert.match(cancellationSource, /Kevin has not yet confirmed/);
    assert.match(cancellationSource, /LEGAL-REVIEW: Effective date/);
    assert.match(cancellationSource, /LEGAL-REVIEW: Chargeback/);
    assert.match(cancellationSource, /LEGAL-REVIEW: Governing law/);
    assert.match(cancellationSource, /LEGAL-REVIEW: Subscriber wording/);
    assert.match(cancellationSource, /LEGAL-REVIEW: Founding Fan/);
    assert.match(publishedSource, /effective_date: "2026-08-03"/);
    assert.match(publishedSource, /updated_at: "2026-08-01T00:00:00\.000Z"/);
    assert.match(publishedSource, /is_draft: false/);
    assert.match(publishedSource, /slug: "cancellation_refund"/);
    assert.match(publishedSource, /CANCELLATION_REFUND_MD/);
  });

  it("renders cancellation through the shared policy layout and leaves the other policies alone", () => {
    assert.match(privacyPage, /PolicyPage slug="privacy"/);
    assert.match(termsPage, /slug="terms"/);
    assert.match(cookiePage, /slug="cookie_policy"/);
    assert.doesNotMatch(privacyPage, /CANCELLATION_POLICY|cancellation-refund/);
    assert.doesNotMatch(termsPage, /CANCELLATION_POLICY|cancellation-refund/);
    assert.doesNotMatch(cookiePage, /CANCELLATION_POLICY|cancellation-refund/);
    assert.match(cancellationPage, /slug="cancellation_refund"/);
    assert.match(cancellationPage, /CANCELLATION_POLICY/);
    assert.match(cancellationPage, /StaticPolicyPage/);
    assert.doesNotMatch(cancellationPage, /<PolicyPage|from "@\/app\/\(legal\)\/policy-page"/);
    assert.match(legalPage, /href: "\/cancellation-refund"/);
  });

  it("uses the repo copy until a non-placeholder policy is published", () => {
    const fallback = {
      slug: "cancellation_refund",
      title: "Cancellation & Refund Policy",
      content_md: CANCELLATION_REFUND_MD,
      effective_date: "2026-08-03",
      is_draft: false,
      updated_at: "2026-08-01T00:00:00.000Z",
    };
    const placeholder = {
      ...fallback,
      content_md:
        "# Cancellation & Refund Policy — DRAFT\n\n_This is a placeholder. Email support@memberengage.app._",
      is_draft: true,
    };
    assert.equal(policyForDisplay(placeholder, fallback), fallback);
    assert.equal(policyForDisplay(null, fallback), fallback);
    assert.equal(isPublishedPolicyContent(placeholder.content_md, false), false);
    assert.equal(isPublishedPolicyContent(placeholder.content_md, true), false);
    const published = {
      ...fallback,
      content_md: "# Counsel final\n\nFinal cancellation policy.",
      is_draft: false,
    };
    assert.equal(policyForDisplay(published, fallback), published);
    assert.equal(policyForDisplay(published, fallback).content_md, published.content_md);
  });
});
