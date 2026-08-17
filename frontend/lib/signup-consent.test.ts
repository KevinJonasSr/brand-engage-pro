import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const signupClient = readFileSync(
  fileURLToPath(new URL("../app/signup/signup-client.tsx", import.meta.url)),
  "utf8",
);
const signupPage = readFileSync(
  fileURLToPath(new URL("../app/signup/page.tsx", import.meta.url)),
  "utf8",
);
const consentModal = readFileSync(
  fileURLToPath(new URL("../components/consent-modal.tsx", import.meta.url)),
  "utf8",
);
const footer = readFileSync(
  fileURLToPath(new URL("../components/footer.tsx", import.meta.url)),
  "utf8",
);
const nextConfig = readFileSync(
  fileURLToPath(new URL("../next.config.ts", import.meta.url)),
  "utf8",
);

describe("signup consent review step", () => {
  it("keeps the idle Create account label on the helper, never security-check copy", () => {
    assert.match(signupClient, /signupTurnstileButtonLabel/);
    const buttonStart = signupClient.indexOf("signupTurnstileButtonLabel");
    const buttonBlock = signupClient.slice(buttonStart, buttonStart + 220);
    assert.doesNotMatch(buttonBlock, /Security check loading/);
  });

  it("opens ConsentModal after email+password and fail-open Turnstile", () => {
    assert.match(signupClient, /ConsentModal/);
    assert.match(signupClient, /setConsentOpen\(true\)/);
    assert.match(signupClient, /gate === "fail-open"/);
    assert.match(signupClient, /CONSENT_COPY\.failOpen|You can still create an account/);
    assert.match(signupClient, /consent_accepted_at/);
    assert.match(signupClient, /consent_version/);
    assert.match(signupClient, /consentReviewTitle/);
  });

  it("loads non-draft terms and privacy on the signup page", () => {
    assert.match(signupPage, /getPolicy\("terms"\)/);
    assert.match(signupPage, /getPolicy\("privacy"\)/);
    assert.match(signupPage, /!p\.is_draft/);
    assert.match(signupPage, /consentDocs/);
  });

  it("makes Terms and Privacy Policy real underlined links in the checkbox", () => {
    assert.match(consentModal, /href="\/terms"/);
    assert.match(consentModal, /href="\/privacy"/);
    assert.match(consentModal, /Privacy Policy/);
    assert.match(consentModal, /underline underline-offset-4/);
    assert.match(consentModal, /CONSENT_COPY\.keepScrollingCue/);
  });

  it("styles footer Terms and Privacy as underlined links", () => {
    assert.match(
      footer,
      /href="\/terms"[^>]*underline/,
    );
    assert.match(
      footer,
      /href="\/privacy"[^>]*underline/,
    );
  });

  it("keeps /join as a signup alias", () => {
    assert.match(nextConfig, /source: "\/join"/);
    assert.match(nextConfig, /destination: "\/signup"/);
  });
});
