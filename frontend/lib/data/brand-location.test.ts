import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseBrandLocationInput, type BrandLocationInput } from "./brand-location.ts";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const base: BrandLocationInput = {
  category: "restaurant",
  city: " Belmont, NC ",
  address: "36 N. Main St., Belmont, NC 28012",
  cuisine: "Southern",
  lat: "35.2426",
  lng: "-81.038",
};

describe("parseBrandLocationInput", () => {
  it("accepts a full valid input and normalises it", () => {
    const r = parseBrandLocationInput(base);
    assert.ok(r.ok);
    assert.deepEqual(r.update, {
      category: "restaurant",
      city: "Belmont, NC",
      address: "36 N. Main St., Belmont, NC 28012",
      cuisine: "southern",
      lat: 35.2426,
      lng: -81.038,
    });
  });

  it("rejects unknown categories, case-insensitively accepts known ones", () => {
    assert.equal(parseBrandLocationInput({ ...base, category: "label" }).ok, false);
    const r = parseBrandLocationInput({ ...base, category: " Hotel " });
    assert.ok(r.ok && r.update.category === "hotel");
  });

  it("rejects out-of-range or non-numeric coordinates", () => {
    assert.equal(parseBrandLocationInput({ ...base, lat: "91" }).ok, false);
    assert.equal(parseBrandLocationInput({ ...base, lat: "-90.5" }).ok, false);
    assert.equal(parseBrandLocationInput({ ...base, lng: "181" }).ok, false);
    assert.equal(parseBrandLocationInput({ ...base, lng: "east" }).ok, false);
  });

  it("requires both coordinates or neither", () => {
    assert.equal(parseBrandLocationInput({ ...base, lng: "" }).ok, false);
    const r = parseBrandLocationInput({ ...base, lat: "", lng: " " });
    assert.ok(r.ok && r.update.lat === null && r.update.lng === null);
  });

  it("maps blank text fields to null", () => {
    const r = parseBrandLocationInput({ ...base, city: "", address: " ", cuisine: "" });
    assert.ok(r.ok);
    assert.equal(r.update.city, null);
    assert.equal(r.update.address, null);
    assert.equal(r.update.cuisine, null);
  });
});

describe("updateBrandLocationAction wiring", () => {
  const actions = read("../../app/admin/brands/actions.ts");
  const page = read("../../app/admin/brands/[slug]/page.tsx");
  it("is gated through the shared brand access check and revalidates both paths", () => {
    const fn = actions.slice(actions.indexOf("export async function updateBrandLocationAction"));
    assert.match(fn, /brandAccessError\(slug\)/);
    assert.match(fn, /parseBrandLocationInput\(/);
    assert.match(fn, /revalidatePath\(`\/brands\/\$\{slug\}`\)/);
    assert.match(fn, /revalidatePath\("\/brands"\)/);
  });
  it("admin page renders a Location & category form posting to the action", () => {
    assert.match(page, /Location &amp; category|Location & category/);
    assert.match(page, /action=\{updateBrandLocationAction\}/);
    for (const name of ["category", "city", "address", "cuisine", "lat", "lng"]) {
      assert.match(page, new RegExp(`name="${name}"`), `missing field ${name}`);
    }
  });
});
