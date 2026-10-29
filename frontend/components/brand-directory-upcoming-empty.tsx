import BrandDirectoryFollow from "./brand-directory-follow";
import { upcomingEmptyCopy } from "./brand-directory-helpers";

/**
 * Empty state for a brand page's Upcoming section. Dark card so the shared
 * FollowButton (styled for the hero) reads correctly; the follow CTA is
 * hidden once the viewer already follows the brand.
 */
export default function BrandDirectoryUpcomingEmpty({
  brandSlug,
  brandName,
  isSignedIn,
  isFollowing,
}: {
  brandSlug: string;
  brandName: string;
  isSignedIn: boolean;
  isFollowing: boolean;
}) {
  const copy = upcomingEmptyCopy(brandName, isFollowing);
  return (
    <div className="flex flex-col items-start justify-between gap-4 rounded-lg bg-iron p-5 text-linen sm:flex-row sm:items-center">
      <div>
        <p className="text-sm font-semibold">{copy.title}</p>
        <p className="mt-1 text-xs text-linen/75">{copy.body}</p>
      </div>
      {!isFollowing && (
        <BrandDirectoryFollow
          brandSlug={brandSlug}
          isSignedIn={isSignedIn}
          isFollowing={false}
          next={`/brands/${brandSlug}#upcoming`}
        />
      )}
    </div>
  );
}
