import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOnboardingHref,
  onboardingDoneHref,
  onboardingNextTarget,
} from "./onboarding-next.ts";
import { safeRelativePath } from "./safe-redirect.ts";

const CHECKIN = "/brands/nellies/checkin?t=abc";

describe("buildOnboardingHref", () => {
  it("is plain /onboarding with no ref or next", () => {
    assert.equal(buildOnboardingHref(null, null), "/onboarding");
  });

  it("keeps ref attribution", () => {
    assert.equal(buildOnboardingHref("nellies", null), "/onboarding?ref=nellies");
  });

  it("carries next through onboarding instead of skipping it", () => {
    const href = buildOnboardingHref("nellies", CHECKIN);
    assert.ok(href.startsWith("/onboarding?"));
    const params = new URL(href, "https://x.invalid").searchParams;
    assert.equal(params.get("ref"), "nellies");
    assert.equal(params.get("next"), CHECKIN);
  });

  it("does not nest onboarding, signup or login as next", () => {
    assert.equal(buildOnboardingHref(null, "/onboarding"), "/onboarding");
    assert.equal(buildOnboardingHref(null, "/onboarding?ref=x"), "/onboarding");
    assert.equal(buildOnboardingHref("x", "/signup?next=/"), "/onboarding?ref=x");
    assert.equal(buildOnboardingHref(null, "/login"), "/onboarding");
  });

  it("drops off-site next values", () => {
    for (const bad of ["//evil.com", "https://evil.com", "evil.com", "/\\evil.com"]) {
      assert.equal(buildOnboardingHref(null, bad), "/onboarding", bad);
    }
  });
});

describe("onboardingDoneHref", () => {
  it("returns the next target when it is a same-site path", () => {
    assert.equal(onboardingDoneHref(CHECKIN), CHECKIN);
    assert.equal(onboardingDoneHref("/rewards"), "/rewards");
  });

  it("falls back to home for missing, off-site or looping targets", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "//evil.com",
      "https://evil.com",
      "/\\evil.com",
      "/onboarding",
      "/signup",
      "/login?next=/x",
    ]) {
      assert.equal(onboardingDoneHref(bad), "/", String(bad));
    }
  });

  it("does not treat lookalike paths as loops", () => {
    assert.equal(onboardingNextTarget("/onboardingx"), "/onboardingx");
  });

  it("composes with safeRelativePath for encoded tricks", () => {
    assert.equal(onboardingDoneHref(safeRelativePath("%2F%2Fevil.com", "")), "/");
    assert.equal(
      onboardingDoneHref(safeRelativePath(encodeURIComponent(CHECKIN), "")),
      CHECKIN,
    );
  });
});
