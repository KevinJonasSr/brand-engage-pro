import { rewardAffordability, type RewardAffordability } from "../../components/reward-affordability.ts";

/**
 * "We miss you" branch of the weekly member digest (Sprint 3, track C).
 *
 * Pure functions only: the cron route runs one query per activity signal,
 * folds the rows through `latestActivityByMember`, and hands the result to
 * `selectLapsedMembers`. Nothing here touches Supabase, so the window maths
 * and the idempotency filter are unit tested under plain `node --test`.
 *
 * Idempotency lives in public.notifications (migration 0010): one row per
 * send with kind "lapsed_nudge" and dedup_key "lapsed_nudge:<YYYY-MM-DD>".
 * The route excludes anyone with such a row in the last LAPSED_RESEND_DAYS.
 */

export const LAPSED_MIN_DAYS = 14;
export const LAPSED_MAX_DAYS = 30;
/** A member gets at most one nudge per this many days. */
export const LAPSED_RESEND_DAYS = 30;
export const LAPSED_NUDGE_KIND = "lapsed_nudge";

const DAY_MS = 24 * 60 * 60 * 1000;

/** One activity timestamp for one member, from any signal table. */
export type ActivitySignal = {
  member_id: string;
  /** ISO timestamp (timestamptz) or YYYY-MM-DD (members.last_active_date). */
  at: string | null | undefined;
};

export type LapsedMemberRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  unsubscribe_token: string | null;
  last_active_date?: string | null;
};

export type LapsedCandidate = {
  id: string;
  email: string;
  firstName: string;
  unsubscribeToken: string;
  /** Whole days since the newest activity signal. */
  daysSinceActivity: number;
  /** Followed brand slugs, in follow order. */
  followedSlugs: string[];
};

export type ActivityBucket = "active" | "lapsed" | "dormant" | "unknown";

function parseAt(at: string | null | undefined): number | null {
  if (!at) return null;
  const s = at.trim();
  if (!s) return null;
  // A bare date (members.last_active_date) is a UTC day, not local midnight.
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00Z`) : Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Newest activity per member across every signal. Rows with no member id or
 * an unparsable timestamp are ignored. Returns epoch milliseconds.
 */
export function latestActivityByMember(
  signals: Iterable<ActivitySignal>,
): Map<string, number> {
  const latest = new Map<string, number>();
  for (const row of signals) {
    const id = row?.member_id;
    if (!id) continue;
    const ms = parseAt(row.at);
    if (ms === null) continue;
    const prev = latest.get(id);
    if (prev === undefined || ms > prev) latest.set(id, ms);
  }
  return latest;
}

/** Whole days between the newest activity and `now` (negative clamps to 0). */
export function daysSince(lastActivityMs: number, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - lastActivityMs) / DAY_MS));
}

/**
 * Where a member sits relative to the nudge window. The window is inclusive:
 * exactly 14 and exactly 30 days both count as lapsed. A member with no
 * signal at all is "unknown" and is never nudged (we cannot say they left).
 */
export function activityBucket(
  lastActivityMs: number | null | undefined,
  now: Date,
): ActivityBucket {
  if (lastActivityMs === null || lastActivityMs === undefined) return "unknown";
  const days = daysSince(lastActivityMs, now);
  if (days < LAPSED_MIN_DAYS) return "active";
  if (days > LAPSED_MAX_DAYS) return "dormant";
  return "lapsed";
}

/**
 * Members who should get a nudge this run.
 *
 *  - newest activity 14–30 days ago (inclusive)
 *  - has an email and an unsubscribe token (no token, no marketing mail)
 *  - follows at least one brand
 *  - not in `digestOptOut` (notification_preferences.notify_weekly_digest=false)
 *  - not in `recentlyNudged` (a lapsed_nudge notification inside 30 days)
 *
 * Order follows `members`, so callers' allowlist / testEmail slicing stays stable.
 */
export function selectLapsedMembers({
  members,
  lastActivity,
  followedSlugsByMember,
  recentlyNudged,
  digestOptOut,
  now,
}: {
  members: readonly LapsedMemberRow[];
  lastActivity: ReadonlyMap<string, number>;
  followedSlugsByMember: ReadonlyMap<string, readonly string[]>;
  recentlyNudged: ReadonlySet<string>;
  digestOptOut?: ReadonlySet<string>;
  now: Date;
}): LapsedCandidate[] {
  const out: LapsedCandidate[] = [];
  for (const m of members) {
    if (!m?.id) continue;
    const email = (m.email ?? "").trim();
    const token = (m.unsubscribe_token ?? "").trim();
    if (!email || !token) continue;
    if (recentlyNudged.has(m.id)) continue;
    if (digestOptOut?.has(m.id)) continue;

    const follows = followedSlugsByMember.get(m.id) ?? [];
    if (follows.length === 0) continue;

    // last_active_date is one of the signals; fold it in here so the caller
    // does not need to turn the members query into a second signal pass.
    let last = lastActivity.get(m.id);
    const fromMember = parseAt(m.last_active_date);
    if (fromMember !== null && (last === undefined || fromMember > last)) last = fromMember;
    if (activityBucket(last, now) !== "lapsed") continue;

    out.push({
      id: m.id,
      email,
      firstName: (m.first_name ?? "").trim() || "there",
      unsubscribeToken: token,
      daysSinceActivity: daysSince(last as number, now),
      followedSlugs: [...follows],
    });
  }
  return out;
}

/** Group follow rows by member, preserving row order. */
export function groupFollows(
  rows: Iterable<{ member_id: string; brand_slug: string }>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    if (!r?.member_id || !r.brand_slug) continue;
    const list = out.get(r.member_id);
    if (list) {
      if (!list.includes(r.brand_slug)) list.push(r.brand_slug);
    } else out.set(r.member_id, [r.brand_slug]);
  }
  return out;
}

/**
 * Member ids that already got a lapsed nudge inside the resend window.
 * `rows` are notifications with kind = LAPSED_NUDGE_KIND.
 */
export function recentlyNudgedIds(
  rows: Iterable<{ member_id: string; created_at: string | null | undefined }>,
  now: Date,
  withinDays: number = LAPSED_RESEND_DAYS,
): Set<string> {
  const cutoff = now.getTime() - withinDays * DAY_MS;
  const out = new Set<string>();
  for (const r of rows) {
    const ms = parseAt(r?.created_at);
    if (ms === null || ms < cutoff) continue;
    if (r.member_id) out.add(r.member_id);
  }
  return out;
}

/** The dedup_key recorded with each send: one nudge per member per day at most. */
export function lapsedDedupKey(now: Date): string {
  return `${LAPSED_NUDGE_KIND}:${now.toISOString().slice(0, 10)}`;
}

/** ISO cutoff for "inside the resend window" queries. */
export function lapsedResendCutoffIso(now: Date, withinDays: number = LAPSED_RESEND_DAYS): string {
  return new Date(now.getTime() - withinDays * DAY_MS).toISOString();
}

/** ISO cutoff for the oldest activity row worth fetching (LAPSED_MAX_DAYS + 1). */
export function lapsedActivityCutoffIso(now: Date): string {
  return new Date(now.getTime() - (LAPSED_MAX_DAYS + 1) * DAY_MS).toISOString();
}

export type RewardLike = {
  id: string;
  title: string;
  point_cost: number;
  community_id: string | null;
};

export type NearestReward<R extends RewardLike = RewardLike> = {
  reward: R;
  affordability: RewardAffordability;
};

/**
 * The reward worth naming: the priciest one the balance covers, otherwise
 * the one with the smallest shortfall. Ties keep catalog order. Null when
 * the list is empty or the balance is unknown.
 */
export function nearestReward<R extends RewardLike>(
  rewards: readonly R[],
  balance: number | null | undefined,
): NearestReward<R> | null {
  if (balance === null || balance === undefined || !Number.isFinite(balance)) return null;
  let best: NearestReward<R> | null = null;
  for (const reward of rewards) {
    const cost = Number(reward.point_cost) || 0;
    if (cost <= 0) continue;
    const affordability = rewardAffordability(cost, balance);
    if (!affordability.known) continue;
    if (!best) {
      best = { reward, affordability };
      continue;
    }
    const b = best.affordability as Extract<RewardAffordability, { known: true }>;
    if (affordability.canAfford && !b.canAfford) {
      best = { reward, affordability };
    } else if (affordability.canAfford && b.canAfford) {
      if (cost > (Number(best.reward.point_cost) || 0)) best = { reward, affordability };
    } else if (!affordability.canAfford && !b.canAfford) {
      if (affordability.shortfall < b.shortfall) best = { reward, affordability };
    }
  }
  return best;
}
