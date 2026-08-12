/**
 * Music / Fan Engage leftover titles that must never surface on BEP marketplace.
 * Soft-launch defense in depth alongside migration 0050.
 * Keep restaurant / dining redeemables.
 */
export const MARKETPLACE_MUSIC_SKU_TITLES = new Set([
  "Fan-to-Artist Q&A",
  "Artist Listening Party",
  "Artist Photography Print",
  "Early Music Release",
  "Studio Session Observer Pass",
  "Tour Laminate / Credential",
  "Signed Vinyl or CD",
  "Personal Video Shoutout",
  "Free Showcase Ticket",
  "Exclusive Pre-Sale Code",
  "Priority Ticket Window",
  "Video Shoutout",
]);

export function isMarketplaceMusicSku(title: string): boolean {
  return MARKETPLACE_MUSIC_SKU_TITLES.has(title);
}
