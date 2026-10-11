import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { prefersReducedMotion, revealDelayMs, scrollBehavior } from "./motion.ts";

const g = globalThis as { window?: unknown };

function setReduce(matches: boolean | "throws" | "missing") {
  if (matches === "missing") {
    g.window = {};
    return;
  }
  g.window = {
    matchMedia: (query: string) => {
      if (matches === "throws") throw new Error("no matchMedia");
      assert.equal(query, "(prefers-reduced-motion: reduce)");
      return { matches };
    },
  };
}

describe("motion helpers", () => {
  afterEach(() => {
    delete g.window;
  });

  it("returns smooth when the phone does not ask for less motion", () => {
    setReduce(false);
    assert.equal(prefersReducedMotion(), false);
    assert.equal(scrollBehavior(), "smooth");
  });

  it("returns auto (instant jump) when reduce motion is on", () => {
    setReduce(true);
    assert.equal(prefersReducedMotion(), true);
    assert.equal(scrollBehavior(), "auto");
  });

  it("falls back to smooth on the server and in old browsers", () => {
    assert.equal(scrollBehavior(), "smooth");
    setReduce("missing");
    assert.equal(scrollBehavior(), "smooth");
    setReduce("throws");
    assert.equal(scrollBehavior(), "smooth");
  });
});

describe("revealDelayMs", () => {
  it("staggers 120ms per item", () => {
    assert.equal(revealDelayMs(0), 0);
    assert.equal(revealDelayMs(1), 120);
    assert.equal(revealDelayMs(3), 360);
  });

  it("caps the wait so a long list never lags", () => {
    assert.equal(revealDelayMs(4), 480);
    assert.equal(revealDelayMs(40), 480);
  });

  it("treats bad input as no delay", () => {
    assert.equal(revealDelayMs(-2), 0);
    assert.equal(revealDelayMs(Number.NaN), 0);
    assert.equal(revealDelayMs(Number.POSITIVE_INFINITY), 0);
  });
});

describe("globals.css reduced-motion block", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../app/globals.css", import.meta.url)),
    "utf8",
  );

  it("has a prefers-reduced-motion: reduce block", () => {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  });

  it("stops looping animations and smooth CSS scrolling", () => {
    const block = css.slice(css.indexOf("prefers-reduced-motion"));
    assert.match(block, /animation-iteration-count: 1 !important/);
    assert.match(block, /scroll-behavior: auto !important/);
    assert.match(block, /\[class\*="animate-"\]/);
  });

  it("has the Front Porch Supper reveal, zoom and press", () => {
    assert.match(css, /@media \(scripting: enabled\)/);
    assert.match(css, /\.bep-reveal \{[^}]*translateY\(24px\)[^}]*560ms/);
    assert.match(css, /\.bep-photo-zoom \{[^}]*900ms/);
    assert.match(css, /scale\(1\.04\)/);
    assert.match(css, /\.bep-press \{[^}]*160ms/);
    assert.match(css, /scale\(0\.98\)/);
  });

  it("turns Front Porch Supper into fades only under reduce motion", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion"));
    assert.match(block, /\.bep-reveal,[\s\S]*\.bep-press:active \{[^}]*transform: none !important/);
  });
});
