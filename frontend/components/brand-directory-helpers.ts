// Pure helpers shared by the brand directory (/brands), the "My brands"
// section on /me, and the brand page's Upcoming empty state. No imports so
// the node test runner can load this file directly.

export type FollowerCountResult = { slug: string; count: number | null };

/** Fold per-brand head-count results into a slug → count map. Null counts
 * (query error) read as 0 so the card simply hides the chip. */
export function followerCountsFromResults(
  results: FollowerCountResult[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of results) out[r.slug] = Math.max(0, r.count ?? 0);
  return out;
}

/** Set of brand slugs the viewer follows, from their own following rows. */
export function followedSlugSet(
  rows: Array<{ brand_slug: string }> | null | undefined,
): Set<string> {
  return new Set((rows ?? []).map((r) => r.brand_slug));
}

/** Login URL that returns the viewer to the directory after signing in. */
export function followLoginHref(next: string = "/brands"): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

export type MyBrandItem = {
  slug: string;
  name: string;
  tier: string | null;
  href: string;
  rewardsHref: string;
};

/**
 * Merge the member's follows and community memberships into one list,
 * keyed by brand slug (community_id == brand slug since migration 0081).
 * Brands that are no longer active (not in `brands`) are dropped. Order
 * follows the directory's brand order.
 */
export function buildMyBrands(
  brands: Array<{ slug: string; name: string }>,
  follows: Array<{ brand_slug: string }> | null | undefined,
  memberships:
    | Array<{ community_id: string; current_tier: string | null }>
    | null
    | undefined,
): MyBrandItem[] {
  const followed = followedSlugSet(follows);
  const tierBySlug = new Map<string, string | null>();
  for (const m of memberships ?? []) {
    tierBySlug.set(m.community_id, m.current_tier ?? null);
  }
  const items: MyBrandItem[] = [];
  for (const b of brands) {
    if (!followed.has(b.slug) && !tierBySlug.has(b.slug)) continue;
    items.push({
      slug: b.slug,
      name: b.name,
      tier: tierBySlug.get(b.slug) ?? null,
      href: `/brands/${b.slug}`,
      rewardsHref: `/brands/${b.slug}/rewards`,
    });
  }
  return items;
}

/** Capitalise a tier slug for display ("gold" → "Gold"). */
export function tierLabel(tier: string | null): string | null {
  if (!tier) return null;
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/** Copy for the Upcoming section when a brand has no events scheduled. */
export function upcomingEmptyCopy(
  brandName: string,
  isFollowing: boolean,
): { title: string; body: string } {
  return {
    title: "No events on the calendar yet.",
    body: isFollowing
      ? `You follow ${brandName}, so you’ll hear when one is announced.`
      : `Follow ${brandName} to hear when one is announced.`,
  };
}
