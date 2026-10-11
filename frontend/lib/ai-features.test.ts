import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_FEATURES,
  disabledCronBody,
  isAiFeatureOn,
  visibleAdminNav,
  type AiFeature,
} from "./ai-features.ts";

const allOn = Object.fromEntries(
  Object.keys(AI_FEATURES).map((k) => [k, true]),
) as Record<AiFeature, boolean>;

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/copilot", label: "Copilot" },
  { href: "/admin/fraud-signals", label: "Fraud" },
  { href: "/admin/post-drafts", label: "Drafts" },
  { href: "/admin/billing", label: "Billing" },
];

describe("AI_FEATURES", () => {
  it("keeps the proven helpers on", () => {
    for (const f of ["dailyAdminBrief", "moderation", "embeddings", "altText", "threadSummary"] as const) {
      assert.equal(AI_FEATURES[f], true, f);
    }
  });

  it("keeps the unproven helpers off", () => {
    for (const f of [
      "copilot",
      "fraudScan",
      "postDrafts",
      "draftReply",
      "tagSuggester",
      "predictionIdeas",
      "captionSuggester",
    ] as const) {
      assert.equal(AI_FEATURES[f], false, f);
    }
  });
});

describe("isAiFeatureOn", () => {
  it("reads the given flags", () => {
    assert.equal(isAiFeatureOn("copilot", allOn), true);
    assert.equal(isAiFeatureOn("copilot"), false);
    assert.equal(isAiFeatureOn("altText"), true);
  });
});

describe("visibleAdminNav", () => {
  it("hides links for features that are off", () => {
    assert.deepEqual(
      visibleAdminNav(NAV).map((i) => i.href),
      ["/admin", "/admin/billing"],
    );
  });

  it("shows them when the features are on", () => {
    assert.equal(visibleAdminNav(NAV, allOn).length, NAV.length);
  });

  it("does not change the input", () => {
    const copy = [...NAV];
    visibleAdminNav(NAV);
    assert.deepEqual(NAV, copy);
  });
});

describe("disabledCronBody", () => {
  it("reports a skip, not a failure", () => {
    assert.deepEqual(disabledCronBody("fraudScan"), {
      ok: true,
      skipped: "disabled",
      feature: "fraudScan",
    });
  });
});
