import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const rewards = readFileSync(
  fileURLToPath(new URL("../app/rewards/page.tsx", import.meta.url)),
  "utf8",
);
const marketplace = readFileSync(
  fileURLToPath(new URL("../app/marketplace/page.tsx", import.meta.url)),
  "utf8",
);
const referrals = readFileSync(
  fileURLToPath(new URL("../app/referrals/page.tsx", import.meta.url)),
  "utf8",
);
const brandRewards = readFileSync(
  fileURLToPath(new URL("../app/brands/[slug]/rewards/page.tsx", import.meta.url)),
  "utf8",
);

describe("preview-theater copy hold", () => {
  it("softens guest lead copy on rewards, marketplace, referrals, and brand rewards", () => {
    for (const [name, src] of [
      ["rewards", rewards],
      ["marketplace", marketplace],
      ["referrals", referrals],
      ["brand rewards", brandRewards],
    ] as const) {
      assert.doesNotMatch(src, /preview theater/i, name);
      assert.doesNotMatch(src, /not a real account/i, name);
      assert.doesNotMatch(src, /No stocked rewards yet/, name);
    }
    assert.match(rewards, /Join free — earn from real visits/);
    assert.match(marketplace, /Live unlocks are on brand pages/);
    assert.match(marketplace, /jonas-group-ent\/rewards/);
    assert.match(referrals, /Invite friends — earn \+150 pts per signup/);
  });
});
