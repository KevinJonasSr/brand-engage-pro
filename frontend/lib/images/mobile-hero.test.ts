import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MOBILE_HERO_MEDIA, mobileHeroFor } from "./mobile-hero.ts";

describe("mobileHeroFor", () => {
  it("returns the plain phone version for the JGE house hero", () => {
    assert.equal(
      mobileHeroFor("/brands/jonas-group-ent/hero-house.jpg"),
      "/brands/jonas-group-ent/hero-house-mobile.jpg",
    );
  });

  it("returns null for heroes without a phone version", () => {
    assert.equal(mobileHeroFor("/brands/jonas-group-ent/hero.png"), null);
    assert.equal(mobileHeroFor("/brands/nellies/hero-sign.jpg"), null);
  });

  it("returns null when there is no hero", () => {
    assert.equal(mobileHeroFor(null), null);
    assert.equal(mobileHeroFor(undefined), null);
    assert.equal(mobileHeroFor(""), null);
  });

  it("targets widths below Tailwind's md breakpoint", () => {
    assert.equal(MOBILE_HERO_MEDIA, "(max-width: 767px)");
  });
});
