import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { COOKIE_POLICY_MD } from "./cookie-policy.ts";
import {
  isPublishedPolicyContent,
  policyForDisplay,
} from "./policy-display.ts";
import { TERMS_OF_USE_MD } from "./terms-of-use.ts";

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
const termsSource = readFileSync(
  fileURLToPath(new URL("./terms-of-use.ts", import.meta.url)),
  "utf8",
);
const cookieSource = readFileSync(
  fileURLToPath(new URL("./cookie-policy.ts", import.meta.url)),
  "utf8",
);
const footer = readFileSync(
  fileURLToPath(new URL("../../components/footer.tsx", import.meta.url)),
  "utf8",
);

const fepLeftovers = [
  /Fan Engage/,
  /\bFEP\b/,
  /RaeLynn/i,
  /Founding Fan/,
  /fanengage/i,
  /\bartists?\b/i,
  /\bfans?\b/i,
  /LEGAL-REVIEW/,
];

/** Operating entity Raymond confirmed. Not a product-name leftover. */
const CONFIRMED_ENTITY = "Fan Engage Pro LLC";

function withoutConfirmedEntity(body: string): string {
  return body.split(CONFIRMED_ENTITY).join("");
}

describe("published terms and cookie policy", () => {
  it("adapts FEP product names and keeps the privacy-page contact", () => {
    for (const body of [TERMS_OF_USE_MD, COOKIE_POLICY_MD]) {
      assert.match(body, /Brand Engage Pro/);
      assert.match(body, /raymond@jonasgroup\.com/);
      assert.match(body, /brandengagepro\.com/);
      const productCopy = withoutConfirmedEntity(body);
      for (const leftover of fepLeftovers) {
        assert.doesNotMatch(productCopy, leftover);
      }
    }
  });

  it("names Fan Engage Pro LLC as the operator and Brand Engage Pro as the product", () => {
    assert.match(
      TERMS_OF_USE_MD,
      /Fan Engage Pro LLC, a Colorado limited liability company \("we," "us," or "our"\), which operates Brand Engage Pro/,
    );
    assert.doesNotMatch(
      TERMS_OF_USE_MD,
      /Brand Engage Pro \("BEP," "we," "us," or "our"\)/,
    );
    assert.match(
      COOKIE_POLICY_MD,
      /Fan Engage Pro LLC, a Colorado limited liability company \([“"]we,[”"] [“"]us,[”"] or [“"]our[”"]\) operates the Brand Engage Pro website/,
    );
    assert.match(COOKIE_POLICY_MD, /Entity: Fan Engage Pro LLC/);
    assert.doesNotMatch(COOKIE_POLICY_MD, /Entity: Brand Engage Pro/);
    assert.match(termsSource, /Raymond confirmed on 2026-10-01/);
    assert.match(termsSource, /Kevin has not yet confirmed/);
    assert.match(cookieSource, /Raymond confirmed on 2026-10-01/);
    assert.match(cookieSource, /Kevin has not yet confirmed/);
  });

  it("keeps FEP legal clauses that still need counsel, outside the page text", () => {
    assert.match(TERMS_OF_USE_MD, /laws of the State of Colorado/);
    assert.match(TERMS_OF_USE_MD, /bhamilton@joneskeller\.com/);
    assert.match(TERMS_OF_USE_MD, /Google Analytics/);
    assert.match(TERMS_OF_USE_MD, /under age 18/i);
    assert.match(TERMS_OF_USE_MD, /rewards points/);
    assert.doesNotMatch(TERMS_OF_USE_MD, /Founding/);
    assert.match(termsSource, /LEGAL-REVIEW: Age/);
    assert.match(termsSource, /LEGAL-REVIEW: Governing law/);
    assert.match(termsSource, /LEGAL-REVIEW: Analytics/);
    assert.match(termsSource, /LEGAL-REVIEW: DMCA agent/);
    assert.match(termsSource, /LEGAL-REVIEW: Loyalty points/);
    assert.match(termsSource, /LEGAL-REVIEW: Subscription/);
    assert.match(cookieSource, /LEGAL-REVIEW: Cookie inventory/);
    assert.match(cookieSource, /LEGAL-REVIEW: Banner behavior/);
    assert.match(cookieSource, /LEGAL-REVIEW: Do Not Track/);
    assert.match(COOKIE_POLICY_MD, /Cloudflare Turnstile/);
    assert.match(COOKIE_POLICY_MD, /local storage/);
  });

  it("renders terms and cookies through the shared policy layout and leaves privacy alone", () => {
    assert.match(privacyPage, /PolicyPage slug="privacy"/);
    assert.doesNotMatch(privacyPage, /published-policies|TERMS_POLICY|COOKIE_POLICY/);
    assert.match(termsPage, /slug="terms"/);
    assert.match(termsPage, /TERMS_POLICY/);
    assert.match(cookiePage, /slug="cookie_policy"/);
    assert.match(cookiePage, /COOKIE_POLICY/);
    assert.match(footer, /href="\/cookie-policy"[^>]*underline/);
  });

  it("uses the repo copy until a non-placeholder policy is published", () => {
    const fallback = {
      slug: "terms",
      title: "Terms of Service",
      content_md: TERMS_OF_USE_MD,
      effective_date: null,
      is_draft: false,
      updated_at: "2026-09-17T00:00:00.000Z",
    };
    const placeholder = {
      ...fallback,
      content_md: "# Terms of Service — DRAFT\n\n_This is a placeholder._",
      is_draft: true,
    };
    assert.equal(policyForDisplay(placeholder, fallback), fallback);
    assert.equal(policyForDisplay(null, fallback), fallback);
    assert.equal(isPublishedPolicyContent(placeholder.content_md, false), false);
    const published = {
      ...fallback,
      content_md: "# Counsel final\n\nFinal terms.",
      is_draft: false,
    };
    assert.equal(policyForDisplay(published, fallback), published);
  });
});
