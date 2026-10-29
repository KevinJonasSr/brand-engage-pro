import Link from "next/link";
import FollowButton from "@/app/brands/[slug]/follow-button";
import { followLoginHref } from "./brand-directory-helpers";

/**
 * Follow control for a directory card or an empty-state card. Signed-in
 * viewers get the real FollowButton (server action); signed-out viewers get
 * a login-gated link styled to match its unfollowed state.
 */
export default function BrandDirectoryFollow({
  brandSlug,
  isSignedIn,
  isFollowing,
  next = "/brands",
}: {
  brandSlug: string;
  isSignedIn: boolean;
  isFollowing: boolean;
  next?: string;
}) {
  if (isSignedIn) {
    return <FollowButton brandSlug={brandSlug} initialFollowing={isFollowing} />;
  }
  return (
    <Link
      href={followLoginHref(next)}
      className="inline-flex rounded-full border border-linen/30 bg-iron/30 px-6 py-3 text-sm font-semibold text-linen backdrop-blur transition hover:bg-linen/10"
    >
      + Follow
    </Link>
  );
}
