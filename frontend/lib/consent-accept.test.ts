import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NELLIES_BRAND_SLUG } from "./nellies-launch.ts";
import {
  CONSENT_COPY,
  NELLIES_CONSENT_DISPLAY_NAME,
  canAcceptConsent,
  consentAcceptLabel,
  consentProgressLabel,
  consentReviewTitle,
  isScrollAtBottom,
  reviewedConsentCount,
  shouldShowKeepScrollingCue,
} from "./consent-accept.ts";

describe("isScrollAtBottom", () => {
  it("is true when content does not overflow", () => {
    assert.equal(
      isScrollAtBottom({ scrollHeight: 200, scrollTop: 0, clientHeight: 200 }),
      true,
    );
  });

  it("is true when already within the 24px end threshold", () => {
    assert.equal(
      isScrollAtBottom({ scrollHeight: 800, scrollTop: 580, clientHeight: 200 }),
      true,
    );
  });

  it("is false when the member is still mid-document", () => {
    assert.equal(
      isScrollAtBottom({ scrollHeight: 800, scrollTop: 0, clientHeight: 200 }),
      false,
    );
  });
});

describe("canAcceptConsent", () => {
  it("unlocks when every doc has been scrolled to the end", () => {
    assert.equal(
      canAcceptConsent({
        docCount: 2,
        scrolledEnd: { 0: true, 1: true },
        acknowledged: false,
      }),
      true,
    );
  });

  it("stays locked if any doc is unread and the checkbox is off", () => {
    assert.equal(
      canAcceptConsent({
        docCount: 2,
        scrolledEnd: { 0: true },
        acknowledged: false,
      }),
      false,
    );
  });

  it("unlocks via the checkbox even when no doc has been scrolled", () => {
    assert.equal(
      canAcceptConsent({
        docCount: 2,
        scrolledEnd: {},
        acknowledged: true,
      }),
      true,
    );
  });

  it("unlocks when there are no docs to review", () => {
    assert.equal(
      canAcceptConsent({
        docCount: 0,
        scrolledEnd: {},
        acknowledged: false,
      }),
      true,
    );
  });
});

describe("consent modal copy and progress", () => {
  it("locks Dash-approved keep-scrolling / accept / checkbox strings", () => {
    assert.equal(
      CONSENT_COPY.keepScrollingCue,
      "Keep scrolling, or check the box below to accept.",
    );
    assert.equal(CONSENT_COPY.lockedAccept, "Keep scrolling or check the box");
    assert.equal(CONSENT_COPY.unlockedAccept, "I agree — create my account");
    assert.equal(
      CONSENT_COPY.checkboxLabel,
      "I have read the Terms and Privacy Policy.",
    );
    assert.equal(CONSENT_COPY.failOpen, "You can still create an account.");
  });

  it("counts reviewed docs and formats progress", () => {
    assert.equal(reviewedConsentCount(2, { 0: true }), 1);
    assert.equal(consentProgressLabel(1, 2), "1 of 2 reviewed");
    assert.equal(consentProgressLabel(0, 1), "0 of 1 reviewed");
  });

  it("shows the keep-scrolling cue until this doc is done or the box is checked", () => {
    assert.equal(
      shouldShowKeepScrollingCue({ currentDocReviewed: false, acknowledged: false }),
      true,
    );
    assert.equal(
      shouldShowKeepScrollingCue({ currentDocReviewed: true, acknowledged: false }),
      false,
    );
    assert.equal(
      shouldShowKeepScrollingCue({ currentDocReviewed: false, acknowledged: true }),
      false,
    );
  });

  it("uses instructional locked Accept copy and the unlocked create-account label", () => {
    assert.equal(consentAcceptLabel(false), CONSENT_COPY.lockedAccept);
    assert.equal(consentAcceptLabel(true), CONSENT_COPY.unlockedAccept);
  });
});

describe("consentReviewTitle", () => {
  it("names Nellie's from the launch slug, not the long kitchen name", () => {
    assert.equal(NELLIES_BRAND_SLUG, "nellies");
    assert.equal(NELLIES_CONSENT_DISPLAY_NAME, "Nellie's");
    assert.equal(
      consentReviewTitle({
        brandSlug: NELLIES_BRAND_SLUG,
        brandName: "Nellie's Southern Kitchen",
      }),
      "Review before you join Nellie's",
    );
  });

  it("uses the referrer brand name when present", () => {
    assert.equal(
      consentReviewTitle({
        brandSlug: "raelynn",
        brandName: "RaeLynn",
      }),
      "Review before you join RaeLynn",
    );
  });

  it("falls back to the generic review title", () => {
    assert.equal(consentReviewTitle({}), "Review before you join");
    assert.equal(
      consentReviewTitle({ brandSlug: "unknown", brandName: null }),
      "Review before you join",
    );
  });
});
