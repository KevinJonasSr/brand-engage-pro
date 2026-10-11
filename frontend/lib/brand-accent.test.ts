import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BEP_ACCENT_FROM,
  BEP_ACCENT_TO,
  IRON,
  LINEN,
  blend,
  brandHeroBackground,
  brandWashBackground,
  contrastRatio,
  darkenUntil,
  normalizeHex,
  resolveBrandAccent,
  sharePalette,
  withAlpha,
} from "./brand-accent.ts";

describe("normalizeHex", () => {
  it("expands short hex and lowercases", () => {
    assert.equal(normalizeHex("#ABC"), "#aabbcc");
    assert.equal(normalizeHex("D4A857"), "#d4a857");
  });

  it("rejects anything that is not a hex color", () => {
    for (const bad of [null, undefined, "", "red", "#12345", "#gggggg", "rgb(0,0,0)"]) {
      assert.equal(normalizeHex(bad), null);
    }
  });
});

describe("contrastRatio", () => {
  it("matches the WCAG extremes", () => {
    assert.equal(contrastRatio("#000000", "#ffffff"), 21);
    assert.equal(contrastRatio("#777777", "#777777"), 1);
  });
});

describe("darkenUntil", () => {
  it("returns the color unchanged when it already passes", () => {
    assert.equal(darkenUntil("#1e1b17", LINEN, 4.5), "#1e1b17");
  });

  it("darkens gold until it passes as text on linen", () => {
    const ink = darkenUntil("#d4a017", LINEN, 4.5);
    assert.ok(contrastRatio(ink, LINEN) >= 4.5);
    assert.notEqual(ink, "#d4a017");
  });
});

describe("withAlpha", () => {
  it("appends a two-digit alpha and clamps", () => {
    assert.equal(withAlpha("#d4a857", 0.2), "#d4a85733");
    assert.equal(withAlpha("#d4a857", 2), "#d4a857ff");
    assert.equal(withAlpha("#d4a857", -1), "#d4a85700");
  });
});

describe("resolveBrandAccent", () => {
  it("picks Nellie's gold as the accent and charcoal as the hero", () => {
    const p = resolveBrandAccent("#1f2937", "#d4a857");
    assert.equal(p.accent, "#d4a857");
    assert.equal(p.onAccent, IRON);
    assert.equal(p.deep, "#1f2937");
    assert.equal(p.isBepDefault, false);
  });

  it("uses the darker color when both are neutral (Jonas Group Ent)", () => {
    const p = resolveBrandAccent("#0a0a0a", "#525252");
    assert.equal(p.accent, "#0a0a0a");
    assert.equal(p.onAccent, LINEN);
  });

  it("falls back to BEP gold and crimson for fork placeholder colors", () => {
    const p = resolveBrandAccent("#7c3aed", "#f97316");
    assert.equal(p.isBepDefault, true);
    assert.equal(p.accent, BEP_ACCENT_FROM);
    // Ember sits just under 7:1, so the hero uses a slightly darker ember.
    assert.notEqual(p.deep, BEP_ACCENT_TO);
    assert.ok(contrastRatio(p.deep, LINEN) >= 7);
  });

  it("falls back when a color is missing or invalid", () => {
    assert.equal(resolveBrandAccent(null, "#d4a857").isBepDefault, true);
    assert.equal(resolveBrandAccent("#1f2937", "teal").isBepDefault, true);
  });

  it("keeps every brand readable, whatever colors it stores", () => {
    const pairs: Array<[string, string]> = [
      ["#1f2937", "#d4a857"],
      ["#0a0a0a", "#525252"],
      ["#ffffff", "#fefefe"],
      ["#fde047", "#a3e635"],
      ["#2563eb", "#1d4ed8"],
      ["#ff0000", "#00ff00"],
    ];
    for (const [from, to] of pairs) {
      const p = resolveBrandAccent(from, to);
      assert.ok(contrastRatio(p.accentInk, LINEN) >= 4.5, `ink ${from}/${to}`);
      assert.ok(contrastRatio(p.accent, p.onAccent) >= 4.5, `on-accent ${from}/${to}`);
      assert.ok(contrastRatio(p.deep, LINEN) >= 7, `hero ${from}/${to}`);
    }
  });
});

describe("backgrounds", () => {
  it("builds hero and wash gradients from the palette", () => {
    const p = resolveBrandAccent("#1f2937", "#d4a857");
    assert.match(brandHeroBackground(p), /^radial-gradient\(.*#d4a85759.*linear-gradient\(160deg, #1f2937,/);
    assert.match(brandWashBackground(p), /#d4a85733/);
  });
});

describe("blend", () => {
  it("returns the ends at alpha 0 and 1", () => {
    assert.equal(blend(IRON, LINEN, 1), IRON);
    assert.equal(blend(IRON, LINEN, 0), LINEN);
  });
});

describe("sharePalette", () => {
  it("puts iron on linen with a muted tone that still reads", () => {
    const s = sharePalette(null, null);
    assert.equal(s.paper, LINEN);
    assert.equal(s.text, IRON);
    assert.ok(contrastRatio(s.muted, LINEN) >= 4.5);
    assert.match(s.wash, /#d4a0173d/);
  });

  it("keeps ink and accent pills readable for any stored pair", () => {
    const pairs: Array<[string, string]> = [
      ["#1f2937", "#d4a857"],
      ["#ffffff", "#fefefe"],
      ["#fde047", "#a3e635"],
      ["#7c3aed", "#f97316"],
    ];
    for (const [from, to] of pairs) {
      const s = sharePalette(from, to);
      assert.ok(contrastRatio(s.accentInk, s.paper) >= 4.5, `ink ${from}/${to}`);
      assert.ok(contrastRatio(s.accent, s.onAccent) >= 4.5, `pill ${from}/${to}`);
    }
  });
});
