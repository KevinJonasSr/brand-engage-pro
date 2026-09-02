/** Canonical live slugs. */
export const NELLIES_SLUG = "nellies";
export const JGE_CANONICAL_SLUG = "jonas-group-ent";

/**
 * Guest-facing aliases for Jonas Group Entertainment.
 * `/brands/<alias>` (and subpaths) should resolve to `/brands/jonas-group-ent`.
 */
export const JGE_SLUG_ALIASES = [
  "jge",
  "jonas-group-entertainment",
  "jonasgroupent",
  "jonasgroup",
  "jonas-group",
] as const;

const BRAND_SLUG_ALIASES: Record<string, string> = Object.fromEntries(
  JGE_SLUG_ALIASES.map((alias) => [alias, JGE_CANONICAL_SLUG]),
);

export function normalizeBrandSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/** Map a typed/URL slug to the canonical brand slug when an alias is used. */
export function resolveBrandSlug(slug: string): string {
  const normalized = normalizeBrandSlug(slug);
  return BRAND_SLUG_ALIASES[normalized] ?? normalized;
}

export function isBrandSlugAlias(slug: string): boolean {
  return normalizeBrandSlug(slug) in BRAND_SLUG_ALIASES;
}

/** Next.js redirect entries: alias → canonical, including subpaths. */
export function brandAliasRedirects(): Array<{
  source: string;
  destination: string;
  permanent: boolean;
}> {
  return JGE_SLUG_ALIASES.flatMap((alias) => [
    {
      source: `/brands/${alias}`,
      destination: `/brands/${JGE_CANONICAL_SLUG}`,
      permanent: false,
    },
    {
      source: `/brands/${alias}/:path*`,
      destination: `/brands/${JGE_CANONICAL_SLUG}/:path*`,
      permanent: false,
    },
  ]);
}
