/**
 * Phone-width art direction for brand heroes.
 *
 * Some hero art has a wordmark painted into it. On phones the hero crops
 * tight and that wordmark lands behind the page title, so those heroes get
 * a plain portrait version for small screens.
 *
 * Keyed by the desktop hero path, so changing a brand's hero_image in the
 * DB turns its phone version off automatically instead of showing old art.
 */

/** Matches Tailwind's `md` breakpoint (768px). */
export const MOBILE_HERO_MEDIA = "(max-width: 767px)";

const MOBILE_HEROES: Readonly<Record<string, string>> = {
  "/brands/jonas-group-ent/hero-house.jpg": "/brands/jonas-group-ent/hero-house-mobile.jpg",
};

/** The phone version of a hero, or null when the hero has none. */
export function mobileHeroFor(heroImage: string | null | undefined): string | null {
  if (!heroImage) return null;
  return MOBILE_HEROES[heroImage] ?? null;
}
