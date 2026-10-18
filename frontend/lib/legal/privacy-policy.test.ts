import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { policyForDisplay } from "./policy-display.ts";
import { PRIVACY_POLICY_MD } from "./privacy-policy.ts";

const publishedSource = readFileSync(
  fileURLToPath(new URL("./published-policies.ts", import.meta.url)),
  "utf8",
);

const privacySource = readFileSync(
  fileURLToPath(new URL("./privacy-policy.ts", import.meta.url)),
  "utf8",
);
const signupPage = readFileSync(
  fileURLToPath(new URL("../../app/signup/page.tsx", import.meta.url)),
  "utf8",
);

const CHILDREN_PARAGRAPH =
  'Our Website is not intended for children under 13 years of age. No one under age 13 may provide any information to or on the Website. We do not knowingly collect Personal Information from children under 13. If you are under 13, do not use or provide any information on this Website or on or through any of its features, register on the Website, make any purchases through the Website, or provide any information about yourself to us, including your name, address, telephone number, e-mail address or any screen name or user name you may use. If we learn we have collected or received Personal Information from a child under 13 without verification of parental consent, we will delete that information. If you believe we might have any information from or about a child under 13, please contact us (please see the "Contact Us" section below).';

describe("published privacy policy", () => {
  it("names the email send path and keeps the four staff-inbox links", () => {
    assert.match(
      PRIVACY_POLICY_MD,
      /email \(Mailchimp Transactional \(Mandrill\)\)/,
    );
    assert.doesNotMatch(PRIVACY_POLICY_MD, /email \(Mailchimp\)/);
    assert.equal(
      PRIVACY_POLICY_MD.match(/mailto:raymond@jonasgroup\.com/g)?.length,
      4,
    );
    assert.match(PRIVACY_POLICY_MD, /This Policy was last updated on October 18, 2026/);
    assert.doesNotMatch(PRIVACY_POLICY_MD, /October 11, 2026/);
    assert.match(publishedSource, /effective_date: "2026-10-11"/);
    assert.match(publishedSource, /is_draft: false/);
    assert.match(publishedSource, /slug: "privacy"/);
    assert.match(publishedSource, /updated_at: "2026-10-18T00:00:00.000Z"/);
  });

  it("leaves the open questions in the page text and the notes in comments", () => {
    assert.equal(
      PRIVACY_POLICY_MD.match(/Fan Engage Pro LLC/g)?.length,
      1,
    );
    assert.match(
      PRIVACY_POLICY_MD,
      /operated by Fan Engage Pro LLC, a Colorado limited liability company \("we", "us"\)/,
    );
    assert.match(
      PRIVACY_POLICY_MD,
      /Brand Engage Pro \("BEP," "we," "us," or "our"\)/,
    );
    assert.match(PRIVACY_POLICY_MD, /Jonas Group family of services/);
    assert.match(PRIVACY_POLICY_MD, /within our family of companies/);
    assert.match(PRIVACY_POLICY_MD, /## Children Under the Age of 13/);
    assert.ok(PRIVACY_POLICY_MD.includes(CHILDREN_PARAGRAPH));
    assert.doesNotMatch(PRIVACY_POLICY_MD, /under age 18|18 and older|18\+/i);
    assert.doesNotMatch(PRIVACY_POLICY_MD, /OPEN QUESTION/);
    assert.match(privacySource, /OPEN QUESTION \(Kevin and Brad\): Legal entity/);
    assert.match(privacySource, /OPEN QUESTION \(Kevin and Brad\): Contact address/);
    assert.match(privacySource, /OPEN QUESTION \(Kevin and Brad\): Affiliate sharing/);
    assert.match(privacySource, /OPEN QUESTION \(Brad and Kevin\): Age/);
    assert.match(privacySource, /four mailto links/);
  });

  it("has no music, fan, or artist product wording beyond the open entity name", () => {
    const productCopy = PRIVACY_POLICY_MD.split("Fan Engage Pro LLC").join("");
    for (const leftover of [
      /Fan Engage/,
      /\bFEP\b/,
      /RaeLynn/i,
      /Founding Fan/,
      /fanengage/i,
      /\bartists?\b/i,
      /\bfans?\b/i,
      /\bmusic\b/i,
    ]) {
      assert.doesNotMatch(productCopy, leftover);
    }
  });

  it("shows the repo copy over the October 11 row and lets a later admin save win", () => {
    const fallback = {
      slug: "privacy",
      title: "Privacy Policy",
      content_md: PRIVACY_POLICY_MD,
      effective_date: "2026-10-11",
      is_draft: false,
      updated_at: "2026-10-18T00:00:00.000Z",
    };
    const carryover = {
      ...fallback,
      content_md: "# Brand Engage Pro Privacy Policy\n\nemail (Mailchimp)",
      updated_at: "2026-10-11T18:04:00+00:00",
    };
    const options = { replaceDbUpdatedBefore: "2026-10-18T00:00:00.000Z" };
    assert.equal(policyForDisplay(carryover, fallback, options), fallback);
    assert.equal(policyForDisplay(null, fallback, options), fallback);
    const saved = {
      ...carryover,
      content_md: "# Counsel saved\n\nDecided privacy text.",
      updated_at: "2026-10-18T15:00:00.000Z",
    };
    assert.equal(policyForDisplay(saved, fallback, options), saved);
    assert.equal(policyForDisplay(carryover, fallback), carryover);
    assert.match(
      publishedSource,
      /PRIVACY_REPLACES_DB_UPDATED_BEFORE = "2026-10-18T00:00:00.000Z"/,
    );
    assert.match(publishedSource, /function privacyForDisplay/);
    const unparsable = { ...carryover, updated_at: "not-a-date" };
    assert.equal(policyForDisplay(unparsable, fallback, options), unparsable);
    assert.match(signupPage, /privacyForDisplay\(privacy\)/);
  });
});
