import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getBrand, listBrands } from "./brands.ts";

describe("hardcoded brand fallback", () => {
  it("lists only the real BEP brands", () => {
    assert.deepEqual(
      listBrands().map((b) => b.slug),
      ["jonas-group-ent", "nellies"],
    );
  });

  it("drops the fork placeholder brands", () => {
    for (const slug of ["raelynn", "bailee", "blake", "konnor", "dan"]) {
      assert.equal(getBrand(slug), null, slug);
    }
  });
});
