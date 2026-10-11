import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { prefersReducedMotion, scrollBehavior } from "./motion.ts";

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
});
