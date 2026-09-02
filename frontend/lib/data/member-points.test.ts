import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sumLedgerDeltas } from "./member-points.ts";

const memberSrc = readFileSync(
  fileURLToPath(new URL("./member.ts", import.meta.url)),
  "utf8",
);
const rewardsPage = readFileSync(
  fileURLToPath(new URL("../../app/rewards/page.tsx", import.meta.url)),
  "utf8",
);
const brandRewards = readFileSync(
  fileURLToPath(new URL("../../app/brands/[slug]/rewards/page.tsx", import.meta.url)),
  "utf8",
);

describe("spendable points source of truth", () => {
  it("sums every ledger delta including adjustments", () => {
    // Lyra walk: welcome +25 (raelynn leftover) + RSVP +10 = 35
    assert.equal(
      sumLedgerDeltas([
        { delta: 25 },
        { delta: 10 },
      ]),
      35,
    );
    assert.equal(sumLedgerDeltas([{ delta: 25 }, { delta: 10 }, { delta: 5 }]), 40);
    assert.equal(sumLedgerDeltas([{ delta: 40 }, { delta: -5 }]), 35);
    assert.equal(sumLedgerDeltas([]), 0);
    assert.equal(sumLedgerDeltas([{ delta: null }, { delta: undefined }]), 0);
  });

  it("KPIs, breakdown, and brand rewards all read the ledger helper", () => {
    assert.match(memberSrc, /getSpendablePoints/);
    assert.match(memberSrc, /sumLedgerDeltas/);
    assert.match(memberSrc, /from\("points_ledger"\)/);
    assert.match(rewardsPage, /getCurrentMemberKpis/);
    assert.match(rewardsPage, /getPointBreakdown/);
    assert.match(rewardsPage, /breakdownTotal/);
    assert.match(brandRewards, /getSpendablePoints/);
    assert.doesNotMatch(brandRewards, /select\("total_points"\)/);
  });
});
