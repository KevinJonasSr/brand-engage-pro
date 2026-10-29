import type { SupabaseClient } from "@supabase/supabase-js";
// Relative, extension-full import (like lib/streaks/touch.ts) so the unit
// tests can load this module under plain `node --test` without the "@/" alias.
import { createAdminClient } from "../supabase/admin.ts";

/**
 * Per-brand mute (migration 0083, public.member_brand_notification_prefs).
 *
 * A member can mute a brand they follow. Brand-triggered fan-outs (new post,
 * drop launched/expiring, prediction launched/resolved) drop muted members
 * before calling sendNotification. Member-scoped notifications (RSVP
 * reminders, redemptions, comments on own posts) are not affected.
 *
 * The table is sparse: no row, or a row with muted=false, means "not muted".
 */

export const BRAND_PREFS_TABLE = "member_brand_notification_prefs";

/**
 * The slice of SupabaseClient these helpers use. Tests pass a fake; triggers
 * leave it undefined and get the service-role client.
 */
type MutedRowClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        value: string | boolean,
      ) => {
        eq: (
          col: string,
          value: string | boolean,
        ) => PromiseLike<{
          data: Array<Record<string, unknown>> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

type Client = MutedRowClient | SupabaseClient;

function asRowClient(client?: Client): MutedRowClient {
  return (client ?? createAdminClient()) as unknown as MutedRowClient;
}

/**
 * Pure filter: keep every follower whose id is not in `mutedIds`. Order and
 * duplicates in `followerIds` are preserved so callers' slicing stays stable.
 */
export function withoutMuted(
  followerIds: readonly string[],
  mutedIds: Iterable<string>,
): string[] {
  const muted = mutedIds instanceof Set ? mutedIds : new Set(mutedIds);
  if (muted.size === 0) return [...followerIds];
  return followerIds.filter((id) => !muted.has(id));
}

/**
 * Slugs of every brand this member has muted. Used by /me/notifications to
 * render the Brands section; the triggers use `excludeMutedFollowers`.
 */
export async function getMutedBrandSlugs(
  memberId: string,
  client?: Client,
): Promise<string[]> {
  const { data, error } = await asRowClient(client)
    .from(BRAND_PREFS_TABLE)
    .select("brand_slug")
    .eq("member_id", memberId)
    .eq("muted", true);
  if (error) throw new Error(`brand-prefs: ${error.message}`);
  return (data ?? []).map((r) => String(r.brand_slug));
}

/**
 * Member ids that have muted `brandSlug`. One query per trigger run.
 */
export async function getMutedMemberIds(
  brandSlug: string,
  client?: Client,
): Promise<Set<string>> {
  const { data, error } = await asRowClient(client)
    .from(BRAND_PREFS_TABLE)
    .select("member_id")
    .eq("brand_slug", brandSlug)
    .eq("muted", true);
  if (error) throw new Error(`brand-prefs: ${error.message}`);
  return new Set((data ?? []).map((r) => String(r.member_id)));
}

/**
 * Drop the followers who muted `brandSlug`. Triggers call this once with the
 * full follower list before fanning out — a single query, not one per member.
 *
 * Errors propagate: a trigger that cannot read mutes skips its fan-out (every
 * trigger already runs inside a non-blocking try/catch). Sending to a member
 * who asked for silence is the worse failure.
 */
export async function excludeMutedFollowers(
  followerIds: readonly string[],
  brandSlug: string,
  client?: Client,
): Promise<string[]> {
  if (followerIds.length === 0) return [];
  const muted = await getMutedMemberIds(brandSlug, client);
  return withoutMuted(followerIds, muted);
}
