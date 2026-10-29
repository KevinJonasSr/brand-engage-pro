import { isBrandCategory, type BrandCategory } from "../brands.ts";

/**
 * Pure validation for the admin "Location & category" form
 * (app/admin/brands/[slug] → updateBrandLocationAction). Kept out of the
 * "use server" module so it can be unit-tested under `node --test`.
 */

export interface BrandLocationInput {
  category: string;
  city: string;
  address: string;
  cuisine: string;
  lat: string;
  lng: string;
}

export interface BrandLocationUpdate {
  category: BrandCategory;
  city: string | null;
  address: string | null;
  cuisine: string | null;
  lat: number | null;
  lng: number | null;
}

export type BrandLocationResult =
  | { ok: true; update: BrandLocationUpdate }
  | { ok: false; error: string };

/** Optional coordinate: blank → null; otherwise a finite number in range. */
function parseCoord(raw: string, max: number, label: string): number | null | string {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return `${label} must be a number.`;
  if (n < -max || n > max) return `${label} must be between -${max} and ${max}.`;
  return Math.round(n * 1e6) / 1e6; // numeric(9,6)
}

export function parseBrandLocationInput(input: BrandLocationInput): BrandLocationResult {
  const category = input.category.trim().toLowerCase();
  if (!isBrandCategory(category)) {
    return { ok: false, error: "Category must be one of restaurant, retail, sports or hotel." };
  }
  const lat = parseCoord(input.lat, 90, "Latitude");
  if (typeof lat === "string") return { ok: false, error: lat };
  const lng = parseCoord(input.lng, 180, "Longitude");
  if (typeof lng === "string") return { ok: false, error: lng };
  if ((lat === null) !== (lng === null)) {
    return { ok: false, error: "Enter both latitude and longitude, or leave both blank." };
  }
  const text = (v: string, max: number) => {
    const t = v.trim();
    return t === "" ? null : t.slice(0, max);
  };
  return {
    ok: true,
    update: {
      category,
      city: text(input.city, 120),
      address: text(input.address, 240),
      cuisine: text(input.cuisine, 60)?.toLowerCase() ?? null,
      lat,
      lng,
    },
  };
}
