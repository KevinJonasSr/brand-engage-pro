import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { listBrandsFromDb } from "@/lib/data/brands";
import BrandDirectoryFollow from "@/components/brand-directory-follow";
import BrandDirectoryNearMe from "@/components/brand-directory-near-me";
import {
  BRAND_CATEGORY_LABELS,
  brandDirectoryHref,
  cityMatches,
  followedSlugSet,
  followerCountsFromResults,
  isBrandCategory,
  presentCategories,
  type BrandCategory,
} from "@/components/brand-directory-helpers";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Brands",
  description:
    "Browse the active member clubs on Brand Engage Pro. Restaurants, retailers, and entertainment companies rewarding their regulars.",
  alternates: { canonical: "/brands" },
  openGraph: {
    type: "website",
    url: "/brands",
    siteName: "Brand Engage Pro",
    title: "Active member clubs",
    description:
      "Browse the brands building member clubs on Brand Engage Pro. Click any brand to see what their hub looks like.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Active member clubs",
    description:
      "Browse the brands building member clubs on Brand Engage Pro.",
  },
};

export const dynamic = "force-dynamic";

/** Discovery columns (migration 0024) the directory reads beside the Brand type. */
type DiscoveryRow = {
  slug: string;
  category: string | null;
  city: string | null;
  cuisine: string | null;
  lat: number | string | null;
  lng: number | string | null;
};

const CHIP_BASE = "inline-flex items-center rounded-full border px-3 py-1 text-xs transition ";
const CHIP_ON = "border-iron/40 bg-iron/15 text-iron";
const CHIP_OFF = "border-iron/10 bg-parchment/30 text-iron/70 hover:border-iron/30";

export default async function BrandsIndexPage({
  searchParams,
}: {
  searchParams?: Promise<{ genre?: string; category?: string; near?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const genreFilter = (sp.genre ?? null) as string | null;
  const categoryFilter: BrandCategory | null = isBrandCategory(sp.category) ? sp.category : null;
  const nearRequested = sp.near === "1";

  const supabase = await createClient();
  const admin = createAdminClient();

  // Viewer relationship: their own following rows (RLS-scoped) in one query,
  // plus their onboarding city for the "Near you" chip.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isSignedIn = user !== null;

  const [brands, discoveryRes, myFollowsRes, memberRes] = await Promise.all([
    listBrandsFromDb(),
    supabase.from("brands").select("slug, category, city, cuisine, lat, lng").eq("active", true),
    isSignedIn
      ? supabase.from("member_brand_following").select("brand_slug").eq("member_id", user.id)
      : Promise.resolve({ data: null }),
    isSignedIn
      ? admin.from("members").select("city").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const followed = followedSlugSet(myFollowsRes.data as Array<{ brand_slug: string }> | null);
  const memberCity = ((memberRes.data as { city?: string | null } | null)?.city ?? "").trim() || null;

  const discoveryBySlug = new Map<string, DiscoveryRow>(
    ((discoveryRes.data ?? []) as DiscoveryRow[]).map((r) => [r.slug, r]),
  );
  const discovery = (slug: string): DiscoveryRow | undefined => discoveryBySlug.get(slug);

  const allGenres = Array.from(new Set(brands.flatMap((a) => a.genres))).sort();
  const categories = presentCategories(brands.map((b) => ({ category: discovery(b.slug)?.category })));
  // "Near you" only makes sense when the member told us their city and at
  // least one brand is in it.
  const hasNearYou =
    memberCity !== null && brands.some((b) => cityMatches(memberCity, discovery(b.slug)?.city));
  const nearFilter = nearRequested && hasNearYou;

  const filteredBrands = brands.filter((a) => {
    if (genreFilter && !a.genres.includes(genreFilter)) return false;
    if (categoryFilter && discovery(a.slug)?.category !== categoryFilter) return false;
    if (nearFilter && !cityMatches(memberCity, discovery(a.slug)?.city)) return false;
    return true;
  });
  const chipHref = (patch: { genre?: string | null; category?: string | null; near?: boolean }) =>
    brandDirectoryHref({
      genre: patch.genre === undefined ? genreFilter : patch.genre,
      category: patch.category === undefined ? categoryFilter : patch.category,
      near: patch.near === undefined ? nearFilter : patch.near,
    });

  // Member counts per brand for social-proof display (M-14). One head-only
  // count per brand (a handful) instead of loading every following row, and
  // QA accounts (members.is_test, migration 0080) are excluded.
  const countResults = await Promise.all(
    brands.map(async (b) => {
      const { count } = await admin
        .from("member_brand_following")
        .select("brand_slug, members!inner(is_test)", { count: "exact", head: true })
        .eq("brand_slug", b.slug)
        .eq("members.is_test", false);
      return { slug: b.slug, count };
    }),
  );
  const memberCounts = followerCountsFromResults(countResults);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-iron/70">Brands</p>
        <h1 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Member clubs on Brand Engage Pro
        </h1>
        <p className="max-w-2xl text-sm text-iron/70">
          Each brand has a dedicated hub with rewards, drops, and behind-the-scenes access for their regulars.
        </p>
      </header>

      
      {(categories.length > 0 || hasNearYou) && (
        <div className="flex flex-wrap gap-2" aria-label="Filter by brand type">
          <Link
            href={chipHref({ category: null, near: false })}
            className={CHIP_BASE + (categoryFilter === null && !nearFilter ? CHIP_ON : CHIP_OFF)}
          >
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c}
              href={chipHref({ category: categoryFilter === c ? null : c })}
              className={CHIP_BASE + (categoryFilter === c ? CHIP_ON : CHIP_OFF)}
            >
              {BRAND_CATEGORY_LABELS[c]}
            </Link>
          ))}
          {hasNearYou && (
            <Link
              href={chipHref({ near: !nearFilter })}
              className={CHIP_BASE + (nearFilter ? CHIP_ON : CHIP_OFF)}
              title={`Brands in ${memberCity}`}
            >
              Near you
            </Link>
          )}
        </div>
      )}

      {allGenres.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Filter by genre">
          <Link
            href={chipHref({ genre: null })}
            className={CHIP_BASE + (genreFilter === null ? CHIP_ON : CHIP_OFF)}
          >
            All genres
          </Link>
          {allGenres.map((g) => (
            <Link
              key={g}
              href={chipHref({ genre: genreFilter === g ? null : g })}
              className={CHIP_BASE + (genreFilter === g ? CHIP_ON : CHIP_OFF)}
            >
              {g}
            </Link>
          ))}
        </div>
      )}

      {filteredBrands.length === 0 && (
        <p className="text-sm text-iron/70">
          No brands match these filters yet.{" "}
          <Link href="/brands" className="underline underline-offset-2 hover:text-iron">
            Show all brands
          </Link>
        </p>
      )}

      {/* Cards render on the server; the near-me layer re-orders them by
          device distance on tap and otherwise leaves this order alone. */}
      <BrandDirectoryNearMe
        coords={filteredBrands.map((b) => ({
          slug: b.slug,
          lat: discovery(b.slug)?.lat ?? null,
          lng: discovery(b.slug)?.lng ?? null,
        }))}
        cards={filteredBrands.map((a) => ({
          slug: a.slug,
          node: (
          <div
            className="group flex flex-col overflow-hidden rounded-lg border border-iron/10 transition hover:border-iron/30 hover:-translate-y-0.5"
          >
          <Link href={`/brands/${a.slug}`} className="block" aria-label={`Enter ${a.name} member club`}>
            {/* 3:4 portrait poster — same shape as the Member Home strip cards
                so the visual language stays consistent across the app. */}
            <div className="relative aspect-[3/4] w-full bg-parchment/40">
              {a.heroImage ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.heroImage}
                    alt=""
                    // object-top keeps the subject's head visible — default
                    // object-cover crops top + bottom equally, slicing heads.
                    className="absolute inset-0 h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.04]"
                    aria-hidden
                  />
                </>
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `linear-gradient(to bottom right, ${a.accentFrom}, ${a.accentTo})`,
                  }}
                  aria-hidden
                />
              )}

              {/* Dark gradient overlay so the text stays readable on any photo */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0) 100%)",
                }}
                aria-hidden
              />

              {/* Top-left genre chip */}
              {a.genres.length > 0 && (
                <p className="absolute left-5 top-5 max-w-[calc(100%-9.5rem)] truncate rounded-full border border-linen/15 bg-iron/45 px-3 py-1 text-xs uppercase tracking-[0.3em] text-linen/85 backdrop-blur">
                  {a.genres.slice(0, 2).join(" · ")}{a.genres.length > 2 ? " +" + (a.genres.length - 2) : ""}
                </p>
              )}

              {/* Top-right chips: member count (M-14) + your relationship */}
              <div className="absolute right-5 top-5 flex flex-col items-end gap-2">
                {(memberCounts[a.slug] ?? 0) > 0 && (
                  <p className="whitespace-nowrap rounded-full border border-linen/15 bg-iron/45 px-3 py-1 text-xs uppercase tracking-[0.3em] text-linen/85 backdrop-blur">
                    {memberCounts[a.slug].toLocaleString()} {memberCounts[a.slug] === 1 ? "member" : "members"}
                  </p>
                )}
                {followed.has(a.slug) && (
                  <p className="whitespace-nowrap rounded-full border border-sage/60 bg-sage/40 px-3 py-1 text-xs uppercase tracking-[0.3em] text-linen backdrop-blur">
                    Following
                  </p>
                )}
              </div>

              {/* Bottom-left content: name + tagline. Full width — the
                  follow control lives in the footer row below, so long
                  names wrap instead of being clipped. */}
              <div className="absolute inset-x-0 bottom-0 p-5">
                <h2
                  className="break-words text-2xl font-semibold leading-tight text-linen drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {a.name}
                </h2>
                {a.tagline && (
                  <p className="mt-1 line-clamp-2 text-sm text-linen/85 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
                    {a.tagline}
                  </p>
                )}
                {(discovery(a.slug)?.city || discovery(a.slug)?.cuisine) && (
                  <p className="mt-1 truncate text-xs uppercase tracking-[0.2em] text-linen/70 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
                    {[discovery(a.slug)?.city, discovery(a.slug)?.cuisine]
                      .filter((v): v is string => !!v && v.trim().length > 0)
                      .join(" · ")}
                  </p>
                )}
              </div>
            </div>
          </Link>
          {/* Footer row: enter link left, follow control right. Sits beside
              the poster link (not inside it) so the button is never an
              interactive element nested in an <a>. Dark surface continues
              the poster gradient so the follow styles stay legible. */}
          <div className="flex items-center justify-between gap-3 bg-iron px-5 py-4">
            <Link
              href={`/brands/${a.slug}`}
              className="text-sm text-linen/90 transition hover:text-linen"
            >
              Enter member club →
            </Link>
            <BrandDirectoryFollow
              brandSlug={a.slug}
              isSignedIn={isSignedIn}
              isFollowing={followed.has(a.slug)}
            />
          </div>
          </div>
          ),
        }))}
      />
    </main>
  );
}
