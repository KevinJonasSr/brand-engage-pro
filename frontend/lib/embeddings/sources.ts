/**
 * Source-table registry for the embedding pipeline (Brand Engage Pro port).
 *
 * Ported from Fan Engage's lib/embeddings/sources.ts with the BEP rename
 * pattern applied:
 *   - brand_events → brand_events
 *   - brand_slug → brand_slug
 *   - specials added (BEP-only — restaurant time-windowed offers)
 *
 * Each entry tells the indexer:
 *   1. How to assemble the embeddable text from a row's columns.
 *   2. How to derive the (community_id, visibility) tenant/access metadata
 *      that gets mirrored into the content_embeddings row.
 *   3. The source_id format. uuid-keyed tables → row.id; communities is
 *      slug-keyed → md5('community:' || slug)::uuid.
 *
 * Adding a new embeddable table = adding one entry to SOURCES below
 * AND adding it to the CHECK constraint + list_unembedded_rows() RPC
 * in migration 0026.
 */

import crypto from "node:crypto";

export type SourceTable =
  | "community_posts"
  | "community_comments"
  | "communities"
  | "brand_events"
  | "rewards_catalog"
  | "specials";

export type Visibility = "public" | "premium" | "founder-only" | "private";

export interface SourceDescriptor {
  table: SourceTable;
  columns: string;
  buildText(row: Record<string, unknown>): string;
  extractMeta(row: Record<string, unknown>): {
    community_id: string;
    visibility: Visibility;
    source_id: string;
  };
}

/** md5-derived uuid for slug-keyed sources. Mirrors list_unembedded_rows()
 *  in migration 0026 — keep in sync. */
export function slugToSourceId(slug: string): string {
  const hex = crypto
    .createHash("md5")
    .update(`community:${slug}`)
    .digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function contentHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function postVisibility(row: Record<string, unknown>): Visibility {
  const v = String(row.visibility ?? "public");
  if (v === "premium") return "premium";
  if (v === "founder-only") return "founder-only";
  return "public";
}

export const SOURCES: Record<SourceTable, SourceDescriptor> = {
  community_posts: {
    table: "community_posts",
    // BEP uses brand_slug (FE used brand_slug). The slug values map onto
    // communities.slug 1:1 — every brand has a parallel community row.
    columns: "id, brand_slug, title, body, visibility",
    buildText: (row) =>
      [row.title, row.body]
        .filter((s): s is string => typeof s === "string" && s.length > 0)
        .join("\n\n"),
    extractMeta: (row) => ({
      community_id: String(row.brand_slug),
      visibility: postVisibility(row),
      source_id: String(row.id),
    }),
  },

  community_comments: {
    table: "community_comments",
    columns: "id, post_id, body",
    buildText: (row) => String(row.body ?? ""),
    extractMeta: (row) => ({
      community_id: String(row.community_id ?? row.brand_slug),
      visibility: postVisibility(row),
      source_id: String(row.id),
    }),
  },

  communities: {
    table: "communities",
    columns: "slug, display_name, tagline, bio, type",
    buildText: (row) => {
      const parts: string[] = [];
      if (row.display_name) parts.push(String(row.display_name));
      if (row.tagline) parts.push(String(row.tagline));
      if (row.bio) parts.push(String(row.bio));
      return parts.join("\n\n");
    },
    extractMeta: (row) => ({
      community_id: String(row.slug),
      visibility: "public",
      source_id: slugToSourceId(String(row.slug)),
    }),
  },

  brand_events: {
    table: "brand_events",
    // BEP brand_events has additional columns vs FE brand_events:
    // location, url, starts_at, ends_at, capacity, image_url. We embed
    // the descriptive fields; structured fields like capacity stay out
    // of the vector.
    columns: "id, brand_slug, title, detail, event_date, location, url",
    buildText: (row) => {
      const parts: string[] = [];
      if (row.title) parts.push(String(row.title));
      if (row.event_date) parts.push(`Date: ${row.event_date}`);
      if (row.location) parts.push(`Location: ${row.location}`);
      if (row.detail) parts.push(String(row.detail));
      return parts.join("\n\n");
    },
    extractMeta: (row) => ({
      community_id: String(row.brand_slug),
      visibility: "public",
      source_id: String(row.id),
    }),
  },

  rewards_catalog: {
    table: "rewards_catalog",
    columns: "id, community_id, title, description, requires_tier",
    buildText: (row) => {
      const parts: string[] = [];
      if (row.title) parts.push(String(row.title));
      if (row.description) parts.push(String(row.description));
      return parts.join("\n\n");
    },
    extractMeta: (row) => {
      const tier = row.requires_tier as string | null;
      const visibility: Visibility =
        tier === "premium" ? "premium"
        : tier === "founder-only" ? "founder-only"
        : "public";
      return {
        community_id: String(row.community_id),
        visibility,
        source_id: String(row.id),
      };
    },
  },

  specials: {
    table: "specials",
    // BEP-only. Restaurant time-windowed offers. tier maps onto our
    // visibility space (public / premium / founder-only).
    columns: "id, community_id, title, description, tier",
    buildText: (row) => {
      const parts: string[] = [];
      if (row.title) parts.push(String(row.title));
      if (row.description) parts.push(String(row.description));
      return parts.join("\n\n");
    },
    extractMeta: (row) => {
      const tier = String(row.tier ?? "public");
      const visibility: Visibility =
        tier === "premium" ? "premium"
        : tier === "founder-only" ? "founder-only"
        : "public";
      return {
        community_id: String(row.community_id),
        visibility,
        source_id: String(row.id),
      };
    },
  },
};

/** Deterministic order — used by the backfill cron. */
export const SOURCE_TABLES: SourceTable[] = [
  "community_posts",
  "community_comments",
  "communities",
  "brand_events",
  "rewards_catalog",
  "specials",
];

