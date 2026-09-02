import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  EMPTY_FIRST_SESSION_FACTS,
  FIRST_SESSION_BLURB,
  FIRST_SESSION_EYEBROW,
  FIRST_SESSION_TITLE,
  firstSessionDoneCount,
  firstSessionSteps,
  isFirstSessionComplete,
  shouldShowFirstSessionChecklist,
} from "./first-session.ts";

const dataSrc = readFileSync(
  fileURLToPath(new URL("./data/first-session.ts", import.meta.url)),
  "utf8",
);
const cardSrc = readFileSync(
  fileURLToPath(new URL("../components/first-session-checklist.tsx", import.meta.url)),
  "utf8",
);
const homeSrc = readFileSync(
  fileURLToPath(new URL("../app/page.tsx", import.meta.url)),
  "utf8",
);
const onboardingSrc = readFileSync(
  fileURLToPath(new URL("../app/onboarding/onboarding-client.tsx", import.meta.url)),
  "utf8",
);
const referralsSrc = readFileSync(
  fileURLToPath(new URL("../app/referrals/page.tsx", import.meta.url)),
  "utf8",
);

const guestFacingCopy = [
  FIRST_SESSION_EYEBROW,
  FIRST_SESSION_TITLE,
  FIRST_SESSION_BLURB,
  ...firstSessionSteps(EMPTY_FIRST_SESSION_FACTS).flatMap((step) => [
    step.label,
    step.detail,
  ]),
].join("\n");

describe("first-session checklist", () => {
  it("lists the four FE-equivalent sticky steps", () => {
    const steps = firstSessionSteps(EMPTY_FIRST_SESSION_FACTS);
    assert.deepEqual(
      steps.map((s) => s.id),
      ["profile", "join", "checkin_or_redeem", "invite"],
    );
    assert.equal(steps[0].href, "/onboarding");
    assert.equal(steps[1].href, "/brands");
    assert.equal(steps[2].href, "/brands/nellies/checkin");
    assert.equal(steps[3].href, "/referrals");
    assert.match(FIRST_SESSION_EYEBROW, /First 72 hours/);
    assert.match(FIRST_SESSION_TITLE, /first session/i);
    assert.match(FIRST_SESSION_BLURB, /Nellie's or JGE/);
    assert.match(FIRST_SESSION_BLURB, /invite one friend/);
  });

  it("auto-hides when every step is done and when dismissed", () => {
    const done = {
      hasProfile: true,
      hasJoinedBrand: true,
      hasCheckinOrRedeem: true,
      hasInvite: true,
    };
    assert.equal(firstSessionDoneCount(done), 4);
    assert.equal(isFirstSessionComplete(done), true);
    assert.equal(shouldShowFirstSessionChecklist(done, false), false);
    assert.equal(
      shouldShowFirstSessionChecklist(EMPTY_FIRST_SESSION_FACTS, true),
      false,
    );
    assert.equal(
      shouldShowFirstSessionChecklist(EMPTY_FIRST_SESSION_FACTS, false),
      true,
    );
    assert.equal(firstSessionDoneCount(EMPTY_FIRST_SESSION_FACTS), 0);
  });

  it("marks individual facts without requiring the rest", () => {
    const steps = firstSessionSteps({
      hasProfile: true,
      hasJoinedBrand: false,
      hasCheckinOrRedeem: true,
      hasInvite: false,
    });
    assert.equal(steps[0].done, true);
    assert.equal(steps[1].done, false);
    assert.equal(steps[2].done, true);
    assert.equal(steps[3].done, false);
    assert.equal(
      firstSessionDoneCount({
        hasProfile: true,
        hasJoinedBrand: false,
        hasCheckinOrRedeem: true,
        hasInvite: false,
      }),
      2,
    );
  });

  it("does not market hidden JGE Aug 30 offers", () => {
    assert.doesNotMatch(guestFacingCopy, /listening part/i);
    assert.doesNotMatch(guestFacingCopy, /songwriter round/i);
    assert.doesNotMatch(guestFacingCopy, /writers round/i);
    assert.doesNotMatch(guestFacingCopy, /presale/i);
    assert.doesNotMatch(guestFacingCopy, /pre-sale/i);
    assert.doesNotMatch(guestFacingCopy, /roster show/i);
    assert.doesNotMatch(guestFacingCopy, /early ticket/i);
  });

  it("does not add list sends or Mailchimp from the checklist", () => {
    assert.doesNotMatch(dataSrc, /mailchimp/i);
    assert.doesNotMatch(dataSrc, /broadcast/i);
    assert.doesNotMatch(cardSrc, /mailchimp/i);
    assert.doesNotMatch(dataSrc, /from\("members"\)\.update/);
    assert.match(dataSrc, /head: true/);
  });

  it("wires home, onboarding, and referrals", () => {
    assert.match(homeSrc, /FirstSessionChecklist/);
    assert.match(homeSrc, /getFirstSessionFacts/);
    assert.match(onboardingSrc, /FirstSessionChecklist/);
    assert.match(onboardingSrc, /dismissible=\{false\}/);
    assert.doesNotMatch(onboardingSrc, /Founders Weekend/);
    assert.doesNotMatch(onboardingSrc, /Marketplace Passport/);
    assert.match(referralsSrc, /FIRST_SESSION_BLURB|FIRST_SESSION_EYEBROW/);
    assert.match(cardSrc, /data-first-session-checklist/);
    assert.match(cardSrc, /Dismiss first-session checklist/);
  });
});
