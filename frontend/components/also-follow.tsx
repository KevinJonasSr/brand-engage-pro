import Image from "next/image";
import Link from "next/link";
import FollowButton from "@/app/brands/[slug]/follow-button";
import Reveal from "@/components/reveal";
import { getCoFollowedBrands } from "@/lib/data/co-follows";
import { createClient } from "@/lib/supabase/server";

/**
 * "Members who follow {name} also follow" — a small strip of brand cards
 * driven by member_brand_following co-occurrence (lib/data/co-follows.ts).
 * Renders nothing when there is no signal, so new deployments with one
 * brand show no empty section. Signed-in viewers get a Follow button on
 * brands they do not already follow.
 */
export default async function AlsoFollow({
  brandSlug,
  brandName,
  viewerId,
  limit = 3,
}: {
  brandSlug: string;
  brandName: string;
  /** Signed-in member id, or null for guests. */
  viewerId: string | null;
  limit?: number;
}) {
  const brands = await getCoFollowedBrands(brandSlug, limit);
  if (brands.length === 0) return null;

  const following = viewerId
    ? await viewerFollows(viewerId, brands.map((b) => b.slug))
    : new Set<string>();

  return (
    <Reveal>
      <section
        aria-label={`Members who follow ${brandName} also follow`}
        className="rounded-lg border border-iron/10 bg-iron/5 backdrop-blur p-4"
      >
        <p className="text-xs uppercase tracking-wide text-iron/70">
          Members who follow {brandName} also follow
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((b) => (
            <li
              key={b.slug}
              className="flex items-center gap-3 rounded-lg border border-iron/10 bg-parchment/40 p-3"
            >
              <Link
                href={`/brands/${b.slug}`}
                className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-iron/10"
                aria-hidden
                tabIndex={-1}
              >
                {b.heroImage && (
                  <Image
                    src={b.heroImage}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/brands/${b.slug}`}
                  className="block truncate text-sm font-semibold text-iron underline-offset-4 hover:underline"
                >
                  {b.name}
                </Link>
                <p className="truncate text-xs text-iron/70">
                  {b.city ?? b.tagline ?? ""}
                </p>
              </div>
              {viewerId && !following.has(b.slug) && (
                <div className="shrink-0 [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-xs">
                  <FollowButton brandSlug={b.slug} initialFollowing={false} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </Reveal>
  );
}

/** Which of `slugs` the viewer already follows. One query, RLS-scoped. */
async function viewerFollows(viewerId: string, slugs: string[]): Promise<Set<string>> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("member_brand_following")
      .select("brand_slug")
      .eq("member_id", viewerId)
      .in("brand_slug", slugs);
    return new Set((data ?? []).map((r) => r.brand_slug as string));
  } catch {
    return new Set();
  }
}
