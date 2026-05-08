import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BRANDS as FALLBACK_BRANDS, type Brand } from "@/lib/brands";

export type { Brand } from "@/lib/brands";

export interface BrandEvent {
  id: string;
  brand_slug: string;
  title: string;
  detail: string | null;
  event_date: string | null;
  url: string | null;
  location: string | null;
  image_url: string | null;
  capacity: number | null;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  active: boolean;
  /** Access tier from migration 0015: 'public' (default) | 'premium'. */
  tier: "public" | "premium";
}

type BrandRow = {
  slug: string;
  name: string;
  tagline: string | null;
  bio: string | null;
  hero_image: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  accent_from: string;
  accent_to: string;
  genres: string[] | null;
  social: Array<{ label: string; href: string }> | null;
  active: boolean;
  sort_order: number;
};

function rowToBrand(row: BrandRow, events: BrandEvent[]): Brand {
  // Preserve the legacy Brand shape (merch still comes from the fallback
  // for now; future phase moves merch to DB-backed offers-per-brand).
  const fallback = FALLBACK_BRANDS[row.slug];
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? "",
    bio: row.bio ?? "",
    heroImage: row.hero_image,
    heroFocalX: row.hero_focal_x ?? undefined,
    heroFocalY: row.hero_focal_y ?? undefined,
    accentFrom: row.accent_from,
    accentTo: row.accent_to,
    genres: row.genres ?? [],
    social: row.social ?? [],
    upcoming: events
      .filter((e) => e.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((e) => ({
        id: e.id,
        title: e.title,
        detail: e.detail ?? "",
        date: e.event_date ?? "",
        capacity: e.capacity ?? null,
        location: e.location ?? null,
        url: e.url ?? null,
        tier: (e.tier ?? "public") as "public" | "premium",
      })),
    merch: fallback?.merch ?? [],
  };
}

/**
 * Fetch a single brand with their active events. Falls back to the
 * hardcoded BRANDS map when Supabase is unreachable or the row is missing
 * — so dev previews without DB creds still render.
 */
export async function getBrandFromDb(slug: string): Promise<Brand | null> {
  try {
    const supabase = await createClient();
    const normalized = slug.toLowerCase();

    const [{ data: brand, error: aErr }, { data: events, error: eErr }] = await Promise.all([
      supabase
        .from("brands")
        .select("slug, name, tagline, bio, hero_image, hero_focal_x, hero_focal_y, accent_from, accent_to, genres, social, active, sort_order")
        .eq("slug", normalized)
        .eq("active", true)
        .maybeSingle(),
      supabase
        .from("brand_events")
        .select("id, brand_slug, title, detail, event_date, url, location, image_url, capacity, starts_at, ends_at, sort_order, active, tier")
        .eq("brand_slug", normalized)
        .eq("active", true)
        .order("sort_order"),
    ]);

    if (aErr || eErr || !brand) {
      return FALLBACK_BRANDS[normalized] ?? null;
    }
    return rowToBrand(brand as BrandRow, (events ?? []) as BrandEvent[]);
  } catch {
    return FALLBACK_BRANDS[slug.toLowerCase()] ?? null;
  }
}

/** List every active brand with their events. */
export async function listBrandsFromDb(): Promise<Brand[]> {
  try {
    const supabase = await createClient();
    const { data: brands, error } = await supabase
      .from("brands")
      .select("slug, name, tagline, bio, hero_image, hero_focal_x, hero_focal_y, accent_from, accent_to, genres, social, active, sort_order")
      .eq("active", true)
      .order("sort_order");
    if (error || !brands || brands.length === 0) {
      return Object.values(FALLBACK_BRANDS);
    }

    const slugs = brands.map((a) => a.slug as string);
    const { data: events } = await supabase
      .from("brand_events")
      .select("id, brand_slug, title, detail, event_date, url, location, image_url, capacity, starts_at, ends_at, sort_order, active, tier")
      .in("brand_slug", slugs)
      .eq("active", true)
      .order("sort_order");

    const byBrand = new Map<string, BrandEvent[]>();
    for (const e of events ?? []) {
      const arr = byBrand.get(e.brand_slug as string) ?? [];
      arr.push(e as BrandEvent);
      byBrand.set(e.brand_slug as string, arr);
    }

    return (brands as BrandRow[]).map((a) =>
      rowToBrand(a, byBrand.get(a.slug) ?? []),
    );
  } catch {
    return Object.values(FALLBACK_BRANDS);
  }
}

/**
 * Admin-scoped variant — uses service role so drafts / inactive brands are
 * visible. Use only from /admin/* server components or server actions.
 */
export async function listBrandsForAdmin(): Promise<
  Array<BrandRow & { event_count: number; follower_count: number }>
> {
  const admin = createAdminClient();
  const [{ data: brands }, { data: events }, { data: follows }] = await Promise.all([
    admin
      .from("brands")
      .select("slug, name, tagline, bio, hero_image, hero_focal_x, hero_focal_y, accent_from, accent_to, genres, social, active, sort_order")
      .order("sort_order"),
    admin.from("brand_events").select("brand_slug"),
    admin.from("member_brand_following").select("brand_slug"),
  ]);

  const eventCounts = new Map<string, number>();
  for (const e of events ?? []) {
    eventCounts.set(e.brand_slug as string, (eventCounts.get(e.brand_slug as string) ?? 0) + 1);
  }
  const followCounts = new Map<string, number>();
  for (const f of follows ?? []) {
    followCounts.set(f.brand_slug as string, (followCounts.get(f.brand_slug as string) ?? 0) + 1);
  }

  return (brands ?? []).map((a) => ({
    ...(a as BrandRow),
    event_count: eventCounts.get(a.slug as string) ?? 0,
    follower_count: followCounts.get(a.slug as string) ?? 0,
  }));
}

/** Admin-scoped: events for a single brand, including inactive. */
export async function listEventsForAdmin(slug: string): Promise<BrandEvent[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("brand_events")
    .select("id, brand_slug, title, detail, event_date, url, location, image_url, capacity, starts_at, ends_at, sort_order, active")
    .eq("brand_slug", slug)
    .order("sort_order");
  return (data ?? []) as BrandEvent[];
}

/** Returns true if the signed-in member follows the given brand. */
export async function doesMemberFollowBrand(brandSlug: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from("member_brand_following")
      .select("brand_slug")
      .eq("member_id", user.id)
      .eq("brand_slug", brandSlug)
      .maybeSingle();
    return data !== null;
  } catch {
    return false;
  }
}
