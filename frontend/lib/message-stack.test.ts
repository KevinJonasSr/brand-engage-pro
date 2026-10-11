import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MESSAGE_GAP_MS,
  MESSAGE_LAND_MS,
  MESSAGE_START_MS,
  MIN_STAGGER_MS,
  TICK_AFTER_LAND_MS,
  messageTimeline,
} from "./message-stack.ts";

describe("messageTimeline", () => {
  it("returns nothing for zero, negative or non-numeric counts", () => {
    assert.deepEqual(messageTimeline(0), []);
    assert.deepEqual(messageTimeline(-2), []);
    assert.deepEqual(messageTimeline(Number.NaN), []);
  });

  it("lands each message one gap after the last", () => {
    const t = messageTimeline(3);
    assert.deepEqual(
      t.map((m) => m.messageDelayMs),
      [MESSAGE_START_MS, MESSAGE_START_MS + MESSAGE_GAP_MS, MESSAGE_START_MS + 2 * MESSAGE_GAP_MS],
    );
  });

  it("fades the Delivered tick in after its message has landed", () => {
    for (const m of messageTimeline(3)) {
      assert.equal(m.tickDelayMs, m.messageDelayMs + MESSAGE_LAND_MS + TICK_AFTER_LAND_MS);
    }
  });

  it("never staggers faster than the 120ms floor", () => {
    const t = messageTimeline(2, 10);
    assert.equal(t[1].messageDelayMs - t[0].messageDelayMs, MIN_STAGGER_MS);
  });

  it("floors fractional counts", () => {
    assert.equal(messageTimeline(2.9).length, 2);
  });
});
