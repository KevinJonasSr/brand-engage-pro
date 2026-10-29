import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stampCardProgress } from "./stamp-card.ts";

describe("stampCardProgress", () => {
  it("counts stamps toward the current round", () => {
    assert.deepEqual(stampCardProgress(3, 5), {
      completedRounds: 0,
      stampsInCurrentRound: 3,
      visitsRemaining: 2,
      justCompleted: false,
    });
  });

  it("marks the card complete when the latest visit fills it", () => {
    assert.deepEqual(stampCardProgress(5, 5), {
      completedRounds: 1,
      stampsInCurrentRound: 0,
      visitsRemaining: 0,
      justCompleted: true,
    });
  });

  it("starts a fresh round after a completed card", () => {
    assert.deepEqual(stampCardProgress(6, 5), {
      completedRounds: 1,
      stampsInCurrentRound: 1,
      visitsRemaining: 4,
      justCompleted: false,
    });
  });

  it("treats zero visits as a full card still to earn", () => {
    assert.deepEqual(stampCardProgress(0, 4), {
      completedRounds: 0,
      stampsInCurrentRound: 0,
      visitsRemaining: 4,
      justCompleted: false,
    });
  });

  it("never divides by zero on a misconfigured card", () => {
    const p = stampCardProgress(2, 0);
    assert.equal(p.completedRounds, 2);
    assert.equal(p.visitsRemaining, 0);
    assert.equal(Number.isFinite(p.stampsInCurrentRound), true);
  });
});
