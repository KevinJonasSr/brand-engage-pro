import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Multi-tenant community resolver (Phase 4b, brand-neutral since Sprint 2)
 *
 * Every request runs through middleware which inspects the hostname and
 * sets an `x-community-id` header. Server components, server actions, and
 * data-layer functions read that header via `getCurrentCommunityId()` and
 * scope their queries accordingly.
 *
 * Hosts that do not name a community (brand-engage-pro.vercel.app, the
 * apex domain, localhost) no longer default to Nellie's. The middleware
 * stamps an empty header and the server-side readers resolve the first
 * active brand from the DB instead, so the shared member pages follow
 * whatever brand is live rather than the brand that launched first.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface Community {
  slug: string;
  display_name: string;
  type: "brand" | "label_meta";
  tagline: string | null;
  bio: string | null;
  accent_from: string;
  accent_to: string;
  hero_image: string | null;
  logo_url: string | null;
  subdomain: string | null;
  active: boolean;
  sort_order: number;
}

export function normalizeCommunitySlug(value: string | null | undefined): string | null {
  const slug = value?.trim().toLowerCase();
  if (!slug || !/^[a-z0-9-]{1,64}$/.test(slug)) return null;
  return slug;
}

/**
 * Header value the middleware stamps when the hostname does not map to a
 * community. Empty on purpose: `Headers.set` needs a string, and readers
 * treat a blank id as "unresolved" and fall through to the DB.
 */
export const UNRESOLVED_COMMUNITY_ID = "";

/** Subdomain → community_slug map. MUST stay in sync with the
 *  communities.subdomain column in the DB. When adding a new community,
 *  update both places. */
export const COMMUNITY_BY_SUBDOMAIN: Record<string, string> = {
  nellies: "nellies",
  "jonas-group-ent": "jonas-group-ent",
  jonasgroupent: "jonas-group-ent",
};

/**
 * Resolve a community id from an HTTP host header. Called by middleware
 * (edge runtime) so it MUST NOT hit the database — the map above is the
 * source of truth for resolution.
 *
 * Returns `UNRESOLVED_COMMUNITY_ID` ("") when the host names no community;
 * `getCurrentCommunityId()` then resolves the first active brand from the DB.
 *
 * Examples:
 *   'nellies.memberengage.app'          → 'nellies'
 *   'jonas-group-ent.memberengage.app'  → 'jonas-group-ent'
 *   'brand-engage-pro.vercel.app'       → ''  (unresolved → first active brand)
 *   'memberengage.app'                  → ''  (apex)
 *   'localhost:3000'                    → ''  (dev)
 */
export function resolveCommunityFromHost(host: string | null | undefined): string {
  if (!host) return UNRESOLVED_COMMUNITY_ID;
  const hostname = host.split(":")[0].toLowerCase();

  // Production *.memberengage.app subdomains
  const memberengageMatch = hostname.match(/^([a-z0-9-]+)\.memberengage\.app$/);
  if (memberengageMatch) {
    return COMMUNITY_BY_SUBDOMAIN[memberengageMatch[1]] ?? UNRESOLVED_COMMUNITY_ID;
  }

  // Vercel preview subdomains for per-community deploys, e.g.
  // 'nellies-member-engage-<hash>-jonas-group.vercel.app'. We don't use
  // these today, but this pattern is easy to add later.

  return UNRESOLVED_COMMUNITY_ID;
}

/**
 * First active brand slug (brands.active = true, lowest sort_order).
 * Module-level cache keeps every RSC on a request (and the next 30s of
 * requests) from re-reading the brands table. Returns null when the DB is
 * unreachable or no brand is active.
 */
let firstActiveBrandCache: { at: number; slug: string | null } | null = null;

export async function getFirstActiveBrandSlug(): Promise<string | null> {
  if (firstActiveBrandCache && Date.now() - firstActiveBrandCache.at < CACHE_TTL_MS) {
    return firstActiveBrandCache.slug;
  }
  let slug: string | null = null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("brands")
      .select("slug")
      .eq("active", true)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("getFirstActiveBrandSlug: supabase error", error.message);
    } else {
      slug = normalizeCommunitySlug((data as { slug?: string } | null)?.slug);
    }
  } catch (err) {
    console.warn("getFirstActiveBrandSlug: failed", err instanceof Error ? err.message : err);
  }
  // Only cache a real answer; a transient DB failure should not pin null for 30s.
  if (slug) firstActiveBrandCache = { at: Date.now(), slug };
  return slug;
}

/** Test seam: clear the first-active-brand cache. */
export function __resetCommunityCachesForTests(): void {
  firstActiveBrandCache = null;
  communityCache.clear();
}

/**
 * Read the community id for the current request, or null when none can
 * be determined.
 *
 * Order of resolution:
 *   1. the `x-community-id` header the middleware stamped from the host;
 *   2. otherwise (unknown host, a request that bypassed middleware, or a
 *      build-time render) the first active brand in the DB;
 *   3. otherwise null — there is no brand-specific default any more.
 *
 * Prefer this in pages that can render a brand-neutral state. Pages and
 * data helpers that must have a slug use `getCurrentCommunityId()`.
 */
export async function getCurrentCommunityIdOrNull(): Promise<string | null> {
  let fromHeader: string | null = null;
  try {
    const h = await headers();
    fromHeader = normalizeCommunitySlug(h.get("x-community-id"));
  } catch {
    // headers() throws outside of a request context (e.g. during build).
  }
  if (fromHeader) return fromHeader;
  return getFirstActiveBrandSlug();
}

/**
 * Read the community id set by middleware on the current request. For
 * use in RSCs, server actions, and data-layer functions that need a slug.
 *
 * Same resolution as `getCurrentCommunityIdOrNull()`, except that when
 * nothing resolves it still returns a string — the first active brand —
 * so existing callers keep working. When even that is unavailable (DB
 * down, no active brands) it returns `UNRESOLVED_COMMUNITY_ID` (""), which
 * matches no community row rather than silently scoping to Nellie's.
 */
export async function getCurrentCommunityId(): Promise<string> {
  return (await getCurrentCommunityIdOrNull()) ?? UNRESOLVED_COMMUNITY_ID;
}

/**
 * Fetch the full community row from the DB — used for theming (accent
 * colors, hero image, display name) and metadata. Small module-level
 * cache keyed by slug to avoid hammering the DB on every RSC render.
 */
const communityCache = new Map<string, { at: number; row: Community | null }>();
const CACHE_TTL_MS = 30_000;

export async function getCommunity(slug: string): Promise<Community | null> {
  if (!slug) return null;
  const hit = communityCache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.row;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("communities")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.warn("getCommunity: supabase error", error.message);
    return null;
  }
  const row = (data as Community | null) ?? null;
  communityCache.set(slug, { at: Date.now(), row });
  return row;
}

/** Convenience: fetch the community for the current request. */
export async function getCurrentCommunity(): Promise<Community | null> {
  const id = await getCurrentCommunityIdOrNull();
  if (!id) return null;
  return getCommunity(id);
}
