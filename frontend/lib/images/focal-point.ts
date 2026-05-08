/**
 * Build object-position style for a brand image based on stored
 * focal-point coordinates.
 *
 * Use this everywhere a hero_image renders — brand hero, /brands
 * directory cards, OG cards, etc. — so all surfaces respect the
 * admin-set focal point uniformly.
 *
 * Defaults to 50/50 (centered) when coords are missing — covers both
 * pre-migration rows and the hardcoded BRANDS fallback map used in
 * dev previews without DB credentials.
 */

export interface HasFocalPoint {
  hero_focal_x?: number | null;
  hero_focal_y?: number | null;
  /** Legacy camelCase accessor used by lib/brands.ts Brand type. */
  heroFocalX?: number | null;
  heroFocalY?: number | null;
}

export function focalPointStyle(
  row: HasFocalPoint | null | undefined,
): { objectPosition: string } {
  const x = row?.hero_focal_x ?? row?.heroFocalX ?? 50;
  const y = row?.hero_focal_y ?? row?.heroFocalY ?? 50;
  return { objectPosition: `${x}% ${y}%` };
}
