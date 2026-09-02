import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ONBOARDING_MEMBER_SELECT,
  buildMemberProfileUpdates,
  isOnboardDraft,
  isOnboardingComplete,
  onboardingResumeStep,
  resolveOnboardingMember,
  wizardFormFromMember,
} from "./onboard-profile.ts";

const onboardRoute = readFileSync(
  fileURLToPath(new URL("../app/api/member-engage/onboard/route.ts", import.meta.url)),
  "utf8",
);
const wizard = readFileSync(
  fileURLToPath(new URL("../app/onboarding/onboarding-client.tsx", import.meta.url)),
  "utf8",
);
const pageSrc = readFileSync(
  fileURLToPath(new URL("../app/onboarding/page.tsx", import.meta.url)),
  "utf8",
);

describe("onboard profile persist", () => {
  it("draft Continue does not stamp consent or opt-in flags", () => {
    assert.equal(isOnboardDraft({ draft: true }), true);
    assert.equal(isOnboardDraft({}), false);

    const updates = buildMemberProfileUpdates({
      draft: true,
      firstName: "Lyra",
      interest: "Rewards",
      consentAcceptedAt: "2026-09-02T00:00:00.000Z",
      smsOptedIn: true,
    });
    assert.equal(updates.first_name, "Lyra");
    assert.equal(updates.interest, "Rewards");
    assert.equal(updates.consent_accepted_at, undefined);
    assert.equal(updates.sms_opted_in, undefined);
    assert.equal(updates.email_opted_in, undefined);
  });

  it("Finish writes name, interests, and consent", () => {
    const updates = buildMemberProfileUpdates({
      firstName: "  Lyra  ",
      interest: "VIP",
      favoriteBrand: "Restaurants & Food",
      consentAcceptedAt: "2026-09-02T12:00:00.000Z",
      consentVersion: "2026-04-22.v1",
      emailOptedIn: true,
      smsOptedIn: false,
    });
    assert.equal(updates.first_name, "Lyra");
    assert.equal(updates.interest, "VIP");
    assert.equal(updates.favorite_brand, "Restaurants & Food");
    assert.equal(updates.consent_accepted_at, "2026-09-02T12:00:00.000Z");
    assert.equal(updates.consent_version, "2026-04-22.v1");
    assert.equal(updates.email_opted_in, true);
    assert.equal(updates.sms_opted_in, false);
  });

  it("onboard route persists via service role and skips bonuses on draft", () => {
    assert.match(onboardRoute, /createAdminClient/);
    assert.match(onboardRoute, /buildMemberProfileUpdates/);
    assert.match(onboardRoute, /isOnboardDraft/);
    assert.match(onboardRoute, /if \(draft\)/);
  });

  it("wizard Finish stays clickable and persists draft fields on Continue", () => {
    assert.match(wizard, /persistProfileDraft/);
    assert.match(wizard, /draft: true/);
    assert.match(wizard, /Please agree to the Terms/);
    assert.match(wizard, /disabled=\{finishStatus === "saving"\}/);
    assert.doesNotMatch(
      wizard,
      /disabled=\{\s*finishStatus === "saving" \|\|[\s\S]*!tosConsent/,
    );
  });

  it("rehydrates name, lane, and favorite brand and does not self-redirect", () => {
    const form = wizardFormFromMember(
      {
        first_name: "Lyra",
        interest: "Rewards",
        favorite_brand: "Restaurants & Food",
        city: "Nashville, TN",
        consent_accepted_at: null,
      },
      "lyra@example.com",
    );
    assert.equal(form.firstName, "Lyra");
    assert.equal(form.interest, "Rewards");
    assert.equal(form.favoriteBrand, "Restaurants & Food");
    assert.equal(form.email, "lyra@example.com");
    assert.equal(onboardingResumeStep(form), 2);
    assert.equal(
      isOnboardingComplete({
        first_name: "Lyra",
        consent_accepted_at: "2026-09-02T12:00:00.000Z",
      }),
      true,
    );
    assert.equal(
      isOnboardingComplete({ first_name: "Lyra", consent_accepted_at: null }),
      false,
    );
    assert.equal(onboardingResumeStep({ firstName: "Lyra" }), 1);
    assert.match(wizard, /initialForm/);
    assert.match(wizard, /window\.location\.assign\("\/"\)/);
    assert.doesNotMatch(wizard, /router\.replace\(`\/signup/);
    assert.doesNotMatch(wizard, /createClient\(\)/);
    assert.match(onboardRoute, /Unable to save interests/);
    assert.match(pageSrc, /isOnboardingComplete/);
    assert.match(pageSrc, /wizardFormFromMember/);
    assert.match(pageSrc, /resolveOnboardingMember/);
  });

  it("treats the live n24 row as finished and does not select birthday_month", () => {
    // Live members (enfpviapxvqyoarwwsuf) has first_name + consent for
    // lyra.cs.walk.bep.0902n24, but no birthday_month column. #24 selected
    // that column; PostgREST returned data:null (no throw) and the gate
    // treated a finished member as a blank 33% wizard.
    assert.equal(
      isOnboardingComplete({
        first_name: "CS Walk N24",
        consent_accepted_at: "2026-09-02 10:35:45.222+00",
      }),
      true,
    );
    assert.doesNotMatch(ONBOARDING_MEMBER_SELECT, /birthday_month/);
    assert.doesNotMatch(pageSrc, /birthday_month/);
    assert.match(ONBOARDING_MEMBER_SELECT, /consent_accepted_at/);
    assert.match(ONBOARDING_MEMBER_SELECT, /first_name/);
  });

  it("recovers the members row when a typed select misses a live column", async () => {
    const n24 = {
      first_name: "CS Walk N24",
      interest: "Rewards",
      favorite_brand: "Restaurants & Food",
      consent_accepted_at: "2026-09-02 10:35:45.222+00",
      email: "lyra.cs.walk.bep.0902n24@jonasgroup.com",
    };
    let calls = 0;
    const member = await resolveOnboardingMember(async (columns) => {
      calls += 1;
      if (columns !== "*") {
        return {
          data: null,
          error: { message: "column members.birthday_month does not exist" },
        };
      }
      return { data: n24, error: null };
    });
    assert.equal(calls, 2);
    assert.equal(member?.first_name, "CS Walk N24");
    assert.equal(isOnboardingComplete(member), true);
  });
});
