import { cache } from "react";
// Relative, extension-full import (like lib/data/stamp-card.ts) so the pure
// ranking helper can be unit-tested under plain `node --test` without the
// "@/" alias. admin.ts depends only on @supabase/supabase-js.
import { createAdminClient } from "../supabase/admin.ts";

/**
 * "Members who follow X also follow" — collaborative signal from
 * member_brand_following. Two queries, never one per member:
 *
 *   1. member_brand_following where brand_slug = X, joined to members so
 *      QA accounts (members.is_test, 0080) drop out.
 *   2. member_brand_following where member_id in (those members) and
 *      brand_slug != X, joined to the active brand row for display fields.
 *
 * Ranking is a pure function (rankCoFollows) so it can be tested without a
 * database.
 */

export interface CoFollowedBrand {
  slug: string;
  name: string;
  tagline: string | null;
  city: string | null;
  heroImage: string | null;
  /** How many of X's (non-test) followers also follow this brand. */
  coFollowers: number;
}

export interface CoFollowRow {
  member_id: string;
  brand_slug: string;
}

export interface CoFollowBrandRow {
  slug: string;
  name: string;
  tagline: string | null;
  city: string | null;
  hero_image: string | null;
  active: boolean;
}

/**
 * Count, per brand, how many distinct members in `rows` follow it, then
 * join to `brands` (only active ones) and return the top `limit` by count.
 * Ties break by brand name so output is stable. `rows` must already exclude
 * the source brand and test members; this function re-checks the source
 * slug defensively.
 */
export function rankCoFollows(
  sourceSlug: string,
  rows: CoFollowRow[],
  brands: CoFollowBrandRow[],
  limit = 3,
): CoFollowedBrand[] {
  if (limit <= 0) return [];
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.brand_slug === sourceSlug) continue;
    const key = `${r.member_id}\u0000${r.brand_slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts.set(r.brand_slug, (counts.get(r.brand_slug) ?? 0) + 1);
  }
  const bySlug = new Map(brands.map((b) => [b.slug, b]));
  const ranked: CoFollowedBrand[] = [];
  for (const [slug, coFollowers] of counts) {
    const b = bySlug.get(slug);
    if (!b || !b.active) continue;
    ranked.push({
      slug: b.slug,
      name: b.name,
      tagline: b.tagline,
      city: b.city,
      heroImage: b.hero_image,
      coFollowers,
    });
  }
  ranked.sort(
    (a, b) => b.coFollowers - a.coFollowers || a.name.localeCompare(b.name),
  );
  return ranked.slice(0, limit);
}

type FollowerRow = { member_id: string; members: { is_test: boolean | null } | null };
type OtherFollowRow = CoFollowRow & { brands: CoFollowBrandRow | null };

/**
 * Brands most co-followed with `brandSlug` by real (non-test) members.
 * Returns [] when nobody follows the brand, on any error, or when the
 * environment has no service-role key — the section simply does not render.
 * Memoised per request via React `cache`.
 */
export const getCoFollowedBrands = cache(async function getCoFollowedBrands(
  brandSlug: string,
  limit = 3,
): Promise<CoFollowedBrand[]> {
  try {
    const admin = createAdminClient();

    // 1. Who follows X (minus QA accounts).
    const { data: followers, error: fErr } = await admin
      .from("member_brand_following")
      .select("member_id, members!inner(is_test)")
      .eq("brand_slug", brandSlug)
      .eq("members.is_test", false);
    if (fErr || !followers || followers.length === 0) return [];
    const memberIds = Array.from(
      new Set((followers as unknown as FollowerRow[]).map((f) => f.member_id)),
    );

    // 2. Everything else those members follow, with the brand row attached.
    const { data: others, error: oErr } = await admin
      .from("member_brand_following")
      .select("member_id, brand_slug, brands!inner(slug, name, tagline, city, hero_image, active)")
      .in("member_id", memberIds)
      .neq("brand_slug", brandSlug)
      .eq("brands.active", true);
    if (oErr || !others) return [];

    const rows = others as unknown as OtherFollowRow[];
    const brands = new Map<string, CoFollowBrandRow>();
    for (const r of rows) {
      if (r.brands && !brands.has(r.brands.slug)) brands.set(r.brands.slug, r.brands);
    }
    return rankCoFollows(
      brandSlug,
      rows.map(({ member_id, brand_slug }) => ({ member_id, brand_slug })),
      Array.from(brands.values()),
      limit,
    );
  } catch {
    return [];
  }
});
