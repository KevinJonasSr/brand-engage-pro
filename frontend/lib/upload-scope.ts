/**
 * Who is allowed to POST /api/upload.
 *
 * Callers found in the app (the upload route itself does not know the page):
 *
 * Member uploads. Any signed-in member. No admin role and no billing lock.
 * - app/rewards/avatar-upload-card.tsx
 *     bucket "avatars". Profile photo. The route also writes members.avatar_url.
 * - app/brands/[slug]/community/new-post-form.tsx
 *     bucket "community-uploads". Photo on a member post, poll, or challenge.
 * - app/brands/[slug]/community/challenge-block.tsx
 *     bucket "community-uploads". Photo on a challenge entry.
 * - components/video-uploader.tsx
 *     bucket "community-uploads". Poster frame grabbed from a member video.
 *     These requests do not send a brand.
 *
 * Brand uploads. The form sends `brand`. The caller must be an admin of
 * that brand, and the brand must be writable (not billing-locked).
 * - app/admin/brands/[slug]/edit-form.tsx
 *     Hero image for the brand page.
 * - app/admin/offers/page.tsx
 *     Image on a new offer.
 * - app/admin/offers/offer-image-editor.tsx
 *     Replacement image on an existing offer.
 *
 * /api/upload/video is separate. Its only caller is components/video-uploader.tsx,
 * used by the member post form. The route was already admin-only. It now
 * also requires the admin's current brand to be writable.
 */

/** A community-uploads request that names a brand is an admin upload. */
export function uploadIsBrandScoped(
  bucket: string,
  brand: string | null | undefined,
): boolean {
  if (bucket === "avatars") return false;
  return (brand ?? "").trim().length > 0;
}
