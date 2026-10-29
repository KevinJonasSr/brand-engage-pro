import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { affordabilityCopy, rewardAffordability } from "../../components/reward-affordability.ts";

describe("rewardAffordability", () => {
  it("is unknown for signed-out viewers", () => {
    assert.deepEqual(rewardAffordability(500, null), { known: false });
    assert.deepEqual(rewardAffordability(500, undefined), { known: false });
    assert.equal(affordabilityCopy(rewardAffordability(500, null)), null);
  });

  it("reports the shortfall and capped progress when short", () => {
    const a = rewardAffordability(1000, 250);
    assert.deepEqual(a, { known: true, canAfford: false, shortfall: 750, percent: 25 });
    assert.equal(affordabilityCopy(a), "You're 750 pts away");
  });

  it("formats large shortfalls with separators", () => {
    assert.equal(affordabilityCopy(rewardAffordability(5000, 1500)), "You're 3,500 pts away");
  });

  it("is affordable at or above the cost, with a full bar", () => {
    assert.deepEqual(rewardAffordability(500, 500), {
      known: true,
      canAfford: true,
      shortfall: 0,
      percent: 100,
    });
    const rich = rewardAffordability(500, 2000);
    assert.ok(rich.known);
    assert.equal(rich.percent, 100);
    assert.equal(affordabilityCopy(rewardAffordability(500, 2000)), "You can redeem this");
  });

  it("treats a free reward as affordable and a negative balance as zero", () => {
    const free = rewardAffordability(0, 0);
    assert.ok(free.known);
    assert.equal(free.canAfford, true);
    assert.deepEqual(rewardAffordability(100, -40), {
      known: true,
      canAfford: false,
      shortfall: 100,
      percent: 0,
    });
  });
});
