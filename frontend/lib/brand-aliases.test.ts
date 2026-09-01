import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getBrand } from "./brands.ts";
import {
  JGE_CANONICAL_SLUG,
  JGE_SLUG_ALIASES,
  brandAliasRedirects,
  isBrandSlugAlias,
  resolveBrandSlug,
} from "./brand-aliases.ts";

const nextConfigSrc = readFileSync(
  fileURLToPath(new URL("../next.config.ts", import.meta.url)),
  "utf8",
);
const proxySrc = readFileSync(
  fileURLToPath(new URL("../proxy.ts", import.meta.url)),
  "utf8",
);
const brandsDataSrc = readFileSync(
  fileURLToPath(new URL("./data/brands.ts", import.meta.url)),
  "utf8",
);

describe("JGE brand slug aliases", () => {
  it("maps jge / jonas-group-entertainment (and extras) to jonas-group-ent", () => {
    assert.equal(resolveBrandSlug("jge"), JGE_CANONICAL_SLUG);
    assert.equal(resolveBrandSlug("JGE"), JGE_CANONICAL_SLUG);
    assert.equal(resolveBrandSlug("jonas-group-entertainment"), JGE_CANONICAL_SLUG);
    assert.equal(resolveBrandSlug("jonasgroupent"), JGE_CANONICAL_SLUG);
    assert.equal(resolveBrandSlug("jonas-group"), JGE_CANONICAL_SLUG);
    assert.equal(resolveBrandSlug("jonas-group-ent"), JGE_CANONICAL_SLUG);
    assert.equal(resolveBrandSlug("nellies"), "nellies");
    assert.equal(isBrandSlugAlias("jge"), true);
    assert.equal(isBrandSlugAlias("jonas-group-ent"), false);
  });

  it("getBrand resolves aliases to the JGE record", () => {
    for (const alias of JGE_SLUG_ALIASES) {
      const brand = getBrand(alias);
      assert.ok(brand, `getBrand(${alias})`);
      assert.equal(brand.slug, JGE_CANONICAL_SLUG);
      assert.equal(brand.name, "Jonas Group Entertainment");
    }
  });

  it("emits next.config-style redirects that preserve community/rewards/founders", () => {
    const redirects = brandAliasRedirects();
    assert.ok(redirects.some((r) => r.source === "/brands/jge"));
    assert.ok(redirects.some((r) => r.source === "/brands/jge/:path*"));
    assert.ok(
      redirects.some((r) => r.source === "/brands/jonas-group-entertainment/:path*"),
    );
    const sub = redirects.find((r) => r.source === "/brands/jge/:path*");
    assert.equal(sub?.destination, `/brands/${JGE_CANONICAL_SLUG}/:path*`);
    assert.match(nextConfigSrc, /brandAliasRedirects/);
    assert.match(proxySrc, /resolveBrandSlug|brandAliasRedirects|isBrandSlugAlias/);
    assert.match(brandsDataSrc, /resolveBrandSlug/);
  });
});
