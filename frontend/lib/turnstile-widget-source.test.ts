import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const widget = readFileSync(
  fileURLToPath(new URL("../components/turnstile-widget.tsx", import.meta.url)),
  "utf8",
);

describe("Turnstile widget www-load robustness", () => {
  it("uses the hang helper so a dead iframe is an error, not a grey button", () => {
    assert.match(widget, /turnstileShouldTreatAsFailedLoad/);
    assert.match(widget, /becameInteractive: interactiveRef\.current/);
    assert.match(widget, /if \(erroredRef\.current\) return false/);
  });

  it("notifies mounted widgets when prefetch gives up", () => {
    assert.match(widget, /notifyTurnstileFailed/);
    assert.match(widget, /failListeners/);
  });

  it("keeps Retry on the fail card, including a missing production key", () => {
    assert.match(widget, /Retry security check/);
    assert.match(widget, /TURNSTILE_WIDGET_ERROR_COPY/);
  });
});
