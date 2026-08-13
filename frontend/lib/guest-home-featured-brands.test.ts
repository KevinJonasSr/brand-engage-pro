import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getBrand, listBrands } from "./brands.ts";
import { featuredBrandsForGuestHome } from "./guest-home-featured-brands.ts";

describe("guest home featured brands", () => {
  it("does not include jonas-group-ent on the featured list", () => {
    const featured = featuredBrandsForGuestHome(listBrands());
    assert.equal(
      featured.some((b) => b.slug === "jonas-group-ent"),
      false,
    );
    assert.equal(
      featured.some((b) => b.name === "Jonas Group Entertainment"),
      false,
    );
  });

  it("still features Nellie's Southern Kitchen", () => {
    const featured = featuredBrandsForGuestHome(listBrands());
    assert.ok(featured.some((b) => b.slug === "nellies"));
  });

  it("keeps the JGE brand record and /brands/jonas-group-ent page", () => {
    const brand = getBrand("jonas-group-ent");
    assert.ok(brand);
    assert.equal(brand.slug, "jonas-group-ent");
    assert.equal(brand.name, "Jonas Group Entertainment");
    assert.ok(
      listBrands().some((b) => b.slug === "jonas-group-ent"),
      "listBrands() must still return JGE for /brands index and brand pages",
    );

    const brandPage = fileURLToPath(
      new URL("../app/brands/[slug]/page.tsx", import.meta.url),
    );
    assert.equal(existsSync(brandPage), true);
    const brandPageSrc = readFileSync(brandPage, "utf8");
    assert.match(brandPageSrc, /listBrands\(\)/);
  });

  it("signed-out home uses the featured helper instead of a raw first-five slice", () => {
    const landing = readFileSync(
      fileURLToPath(new URL("../components/signed-out-landing.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(landing, /featuredBrandsForGuestHome/);
    assert.doesNotMatch(landing, /brands\.slice\(\s*0\s*,\s*5\s*\)/);
  });

  it("hides JGE from /for-brands featured tiles without dropping /brands index", () => {
    const forBrands = readFileSync(
      fileURLToPath(new URL("../app/for-brands/page.tsx", import.meta.url)),
      "utf8",
    );
    const brandsIndex = readFileSync(
      fileURLToPath(new URL("../app/brands/page.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(forBrands, /isGuestHomeFeaturedBrand/);
    assert.doesNotMatch(brandsIndex, /guest-home-featured-brands|isGuestHomeFeaturedBrand/);
  });

  it("hides by display name even when the slug is not jonas-group-ent", () => {
    const nellies = listBrands().find((b) => b.slug === "nellies");
    assert.ok(nellies);
    const alias = {
      ...nellies,
      slug: "jge-alias",
      name: "Jonas Group Entertainment",
    };
    const featured = featuredBrandsForGuestHome([alias, nellies]);
    assert.deepEqual(
      featured.map((b) => b.slug),
      ["nellies"],
    );
  });
});
