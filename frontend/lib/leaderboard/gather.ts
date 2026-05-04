import { createAdminClient } from "@/lib/supabase/admin";
import type {
  BrandMonthlyLeaderboard,
  LeaderboardEntry,
} from "./types";

const SCORE_WEIGHTS = {
  reaction: 1,
  comment: 3,
  rsvp: 5,
  redemption: 10,
} as const;

/** Get the first day (UTC midnight) of the month containing `at`. */
function startOfMonthUtc(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

function formatMonthLabel(monthStart: Date): string {
  return monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Compute the per-brand monthly leaderboard. Returns top N + the viewer's
 * own rank if they have any activity this month.
 *
 * Implementation: 4 parallel COUNT-style queries scoped to the month and
 * brand, merged in TS into a per-member score map. Then sort, slice, and
 * resolve display names + avatars in a single batch read on `members`.
 *
 * Failure mode: any error returns a benign empty leaderboard so the
 * page can render a "Be the first to top the chart" empty state.
 */
export async function gatherBrandLeaderboard(opts: {
  brandSlug: string;
  viewerMemberId?: string | null;
  topN?: number;
  monthStart?: Date; // defaults to current calendar month UTC
}): Promise<BrandMonthlyLeaderboard | null> {
  const topN = opts.topN ?? 10;
  const monthStart = startOfMonthUtc(opts.monthStart ?? new Date());
  const nextMonth = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );
  const monthStartIso = monthStart.toISOString();
  const nextMonthIso = nextMonth.toISOString();

  const empty: BrandMonthlyLeaderboard = {
    monthStart: monthStartIso,
    monthLabel: formatMonthLabel(monthStart),
    brandSlug: opts.brandSlug,
    brandName: opts.brandSlug,
    top: [],
    viewerEntry: null,
    totalMembers: 0,
  };

  try {
    const admin = createAdminClient();

    // Resolve brand display name (best-effort; falls back to slug).
    const artistPromise = admin
      .from("brands")
      .select("name, slug")
      .eq("slug", opts.brandSlug)
      .maybeSingle();

    // Step 1: collect post IDs that belong to this brand's community.
    // We need this to scope reactions + comments — the reaction/comment
    // tables don't carry brand_slug directly.
    const postsPromise = admin
      .from("community_posts")
      .select("id")
      .eq("brand_slug", opts.brandSlug);

    // Step 2: brand-scoped event IDs for RSVP scoping.
    const eventsPromise = admin
      .from("brand_events")
      .select("id")
      .eq("brand_slug", opts.brandSlug);

    const [brandRes, postsRes, eventsRes] = await Promise.all([
      artistPromise,
      postsPromise,
      eventsPromise,
    ]);

    const brandName =
      (brandRes.data?.name as string | undefined) ?? opts.brandSlug;
    const postIds = (postsRes.data ?? []).map((p) => p.id as string);
    const eventIds = (eventsRes.data ?? []).map((e) => e.id as string);

    // Step 3: pull this month's activity rows scoped to those post/event IDs.
    // If the brand has no posts at all, reactions/comments come back empty
    // and we skip the IN-clause (Supabase rejects an empty `in()`).
    const reactionsPromise =
      postIds.length > 0
        ? admin
            .from("community_reactions")
            .select("member_id")
            .in("post_id", postIds)
            .gte("created_at", monthStartIso)
            .lt("created_at", nextMonthIso)
        : Promise.resolve({ data: [] as Array<{ member_id: string }> });

    const commentsPromise =
      postIds.length > 0
        ? admin
            .from("community_comments")
            .select("author_id")
            .in("post_id", postIds)
            .gte("created_at", monthStartIso)
            .lt("created_at", nextMonthIso)
        : Promise.resolve({ data: [] as Array<{ author_id: string }> });

    const rsvpsPromise =
      eventIds.length > 0
        ? admin
            .from("event_rsvps")
            .select("member_id")
            .in("event_id", eventIds)
            .gte("created_at", monthStartIso)
            .lt("created_at", nextMonthIso)
        : Promise.resolve({ data: [] as Array<{ member_id: string }> });

    // Redemptions are scoped via reward_redemptions.community_id == brandSlug.
    // Some platforms set community_id to null for global rewards; we
    // intentionally exclude those from the per-brand leaderboard.
    const redemptionsPromise = admin
      .from("reward_redemptions")
      .select("member_id, status")
      .eq("community_id", opts.brandSlug)
      .neq("status", "cancelled")
      .gte("created_at", monthStartIso)
      .lt("created_at", nextMonthIso);

    const [reactionsRes, commentsRes, rsvpsRes, redemptionsRes] =
      await Promise.all([
        reactionsPromise,
        commentsPromise,
        rsvpsPromise,
        redemptionsPromise,
      ]);

    // Aggregate into per-member score map.
    const scores = new Map<
      string,
      Pick<LeaderboardEntry, "reactions" | "comments" | "rsvps" | "redemptions" | "score">
    >();

    function bump(
      memberId: string,
      key: "reactions" | "comments" | "rsvps" | "redemptions",
      pts: number,
    ) {
      const cur = scores.get(memberId) ?? {
        reactions: 0,
        comments: 0,
        rsvps: 0,
        redemptions: 0,
        score: 0,
      };
      cur[key] += 1;
      cur.score += pts;
      scores.set(memberId, cur);
    }

    for (const r of reactionsRes.data ?? [])
      bump(r.member_id as string, "reactions", SCORE_WEIGHTS.reaction);
    for (const c of commentsRes.data ?? [])
      bump(c.author_id as string, "comments", SCORE_WEIGHTS.comment);
    for (const r of rsvpsRes.data ?? [])
      bump(r.member_id as string, "rsvps", SCORE_WEIGHTS.rsvp);
    for (const r of redemptionsRes.data ?? [])
      bump(r.member_id as string, "redemptions", SCORE_WEIGHTS.redemption);

    if (scores.size === 0) {
      return { ...empty, brandName };
    }

    // Sort by score desc; tie-break by member_id for stability (could refine to
    // earliest-activity timestamp if ties matter visually).
    const sorted = Array.from(scores.entries()).sort((a, b) => {
      if (b[1].score !== a[1].score) return b[1].score - a[1].score;
      return a[0].localeCompare(b[0]);
    });

    // Resolve display names + avatars + tier in a single batch
    const memberIds = sorted.map(([memberId]) => memberId);
    const { data: memberRows } = await admin
      .from("members")
      .select("id, first_name, last_name, avatar_url, current_tier")
      .in("id", memberIds);
    const memberInfoById = new Map<
      string,
      {
        display_name: string;
        avatar_url: string | null;
        current_tier: string | null;
      }
    >();
    for (const f of memberRows ?? []) {
      const first = (f.first_name as string | null) ?? "";
      const last = (f.last_name as string | null) ?? "";
      const display = [first, last].filter(Boolean).join(" ").trim() || "A member";
      memberInfoById.set(f.id as string, {
        display_name: display,
        avatar_url: (f.avatar_url as string | null) ?? null,
        current_tier: (f.current_tier as string | null) ?? null,
      });
    }

    function buildEntry(rank: number, memberId: string): LeaderboardEntry {
      const s = scores.get(memberId)!;
      const info = memberInfoById.get(memberId);
      return {
        member_id: memberId,
        rank,
        display_name: info?.display_name ?? "A member",
        avatar_url: info?.avatar_url ?? null,
        current_tier: info?.current_tier ?? null,
        score: s.score,
        reactions: s.reactions,
        comments: s.comments,
        rsvps: s.rsvps,
        redemptions: s.redemptions,
      };
    }

    const top: LeaderboardEntry[] = sorted
      .slice(0, topN)
      .map(([memberId], idx) => buildEntry(idx + 1, memberId));

    let viewerEntry: LeaderboardEntry | null = null;
    if (opts.viewerMemberId) {
      const viewerIdx = sorted.findIndex(([id]) => id === opts.viewerMemberId);
      if (viewerIdx !== -1) {
        viewerEntry = buildEntry(viewerIdx + 1, opts.viewerMemberId);
      }
    }

    return {
      monthStart: monthStartIso,
      monthLabel: formatMonthLabel(monthStart),
      brandSlug: opts.brandSlug,
      brandName,
      top,
      viewerEntry,
      totalMembers: sorted.length,
    };
  } catch (err) {
    console.warn("gatherBrandLeaderboard failed (non-blocking):", err);
    return empty;
  }
}
