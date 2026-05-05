import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAnniversary } from "@/lib/notifications/triggers/anniversary";
import {
  MILESTONES,
  type AnniversaryEvent,
  type AnniversaryMilestone,
  type FollowingRow,
  type MilestoneConfig,
} from "./types";

interface BrandRow {
  slug: string;
  name: string;
}

interface AnniversaryLogRow {
  member_id: string;
  brand_slug: string;
  milestone: string;
}

/**
 * Compute which milestones are due for a (member, brand) given their
 * followed_at and the milestones already in member_anniversary_log.
 */
function dueMilestones(
  followedAt: string,
  alreadyCelebrated: Set<string>,
  now: number,
): MilestoneConfig[] {
  const tenureMs = now - new Date(followedAt).getTime();
  const tenureDays = tenureMs / (1000 * 60 * 60 * 24);
  return MILESTONES.filter(
    (m) => tenureDays >= m.daysRequired && !alreadyCelebrated.has(m.key),
  );
}

/**
 * Process anniversaries across all (member, brand) pairs. Idempotent:
 * the unique constraint on (member_id, brand_slug, milestone) means
 * re-runs do nothing if no new milestones are due.
 *
 * Returns a summary the cron route logs to Vercel.
 */
export async function processAllAnniversaries(): Promise<{
  scanned: number;
  celebrated: number;
  pointsAwarded: number;
  errors: number;
}> {
  const admin = createAdminClient();
  const now = Date.now();

  const { data: followingRows, error: followErr } = await admin
    .from("member_brand_following")
    .select("member_id, brand_slug, followed_at");
  if (followErr || !followingRows) {
    console.warn("processAllAnniversaries: failed to load following rows", followErr);
    return { scanned: 0, celebrated: 0, pointsAwarded: 0, errors: 1 };
  }
  const follows = followingRows as unknown as FollowingRow[];

  if (follows.length === 0) {
    return { scanned: 0, celebrated: 0, pointsAwarded: 0, errors: 0 };
  }

  // Bulk-load already-celebrated milestones so we don't N+1 the DB.
  const memberIds = Array.from(new Set(follows.map((f) => f.member_id)));
  const { data: logRows } = await admin
    .from("member_anniversary_log")
    .select("member_id, brand_slug, milestone")
    .in("member_id", memberIds);

  const celebrated = new Set<string>(
    ((logRows ?? []) as unknown as AnniversaryLogRow[]).map(
      (r) => `${r.member_id}|${r.brand_slug}|${r.milestone}`,
    ),
  );

  // Bulk-load brand names so push messages read "It's been one year with
  // Nellie's!" rather than "...with nellies".
  const brandSlugs = Array.from(new Set(follows.map((f) => f.brand_slug)));
  const { data: brandRows } = await admin
    .from("brands")
    .select("slug, name")
    .in("slug", brandSlugs);
  const brandNameBySlug = new Map<string, string>();
  for (const b of (brandRows ?? []) as unknown as BrandRow[]) {
    brandNameBySlug.set(b.slug, b.name);
  }

  // Walk every following row, compute due milestones, fire each.
  const events: AnniversaryEvent[] = [];
  for (const f of follows) {
    const alreadyForPair = new Set(
      MILESTONES.map((m) => m.key).filter((k) =>
        celebrated.has(`${f.member_id}|${f.brand_slug}|${k}`),
      ),
    );
    const due = dueMilestones(f.followed_at, alreadyForPair, now);
    for (const m of due) {
      events.push({
        member_id: f.member_id,
        brand_slug: f.brand_slug,
        brand_name: brandNameBySlug.get(f.brand_slug) ?? f.brand_slug,
        milestone: m.key,
        points: m.points,
        label: m.label,
      });
    }
  }

  if (events.length === 0) {
    return { scanned: follows.length, celebrated: 0, pointsAwarded: 0, errors: 0 };
  }

  let celebratedCount = 0;
  let pointsAwarded = 0;
  let errors = 0;

  // Process events one at a time. The unique-on-conflict means a parallel
  // run by another worker won't double-fire — they'll get a constraint
  // violation we handle below.
  for (const ev of events) {
    try {
      // 1. Insert anniversary log row first (acts as our dedupe lock).
      const { data: inserted, error: insErr } = await admin
        .from("member_anniversary_log")
        .insert({
          member_id: ev.member_id,
          brand_slug: ev.brand_slug,
          milestone: ev.milestone,
          points_awarded: ev.points,
          metadata: { brand_name: ev.brand_name, label: ev.label },
        })
        .select("id")
        .single();

      if (insErr) {
        // 23505 = unique_violation → already celebrated by another worker.
        // Anything else: skip and count as error.
        if (insErr.code !== "23505") {
          console.warn(
            `anniversary insert failed for ${ev.member_id}/${ev.brand_slug}/${ev.milestone}:`,
            insErr,
          );
          errors += 1;
        }
        continue;
      }
      if (!inserted) continue;

      // 2. Award points to the member's ledger.
      const { error: ledgerErr } = await admin.from("points_ledger").insert({
        member_id: ev.member_id,
        community_id: ev.brand_slug,
        delta: ev.points,
        source: "anniversary",
        source_ref: ev.milestone,
        note: `${ev.label} with ${ev.brand_name}`,
      });
      if (ledgerErr) {
        console.warn(
          `anniversary ledger insert failed for ${ev.member_id}:`,
          ledgerErr,
        );
        // Don't fail the whole event — log row is in, push will still fire.
      }

      // 3. Push notification (best-effort).
      try {
        await notifyAnniversary({
          memberId: ev.member_id,
          brandSlug: ev.brand_slug,
          brandName: ev.brand_name,
          label: ev.label,
          points: ev.points,
        });
      } catch (pushErr) {
        console.warn("anniversary push failed (non-blocking):", pushErr);
      }

      celebratedCount += 1;
      pointsAwarded += ev.points;
    } catch (err) {
      console.warn("anniversary event failed:", err);
      errors += 1;
    }
  }

  return {
    scanned: follows.length,
    celebrated: celebratedCount,
    pointsAwarded,
    errors,
  };
}

/**
 * Single-member entry point — useful if we ever want to fire from a UI
 * action ("celebrate me now") or backfill one member at a time.
 */
export async function processAnniversariesForMember(memberId: string): Promise<{
  celebrated: number;
  pointsAwarded: number;
}> {
  const admin = createAdminClient();
  const now = Date.now();

  const { data: followingRows } = await admin
    .from("member_brand_following")
    .select("member_id, brand_slug, followed_at")
    .eq("member_id", memberId);
  const follows = (followingRows ?? []) as unknown as FollowingRow[];
  if (follows.length === 0) return { celebrated: 0, pointsAwarded: 0 };

  const { data: logRows } = await admin
    .from("member_anniversary_log")
    .select("member_id, brand_slug, milestone")
    .eq("member_id", memberId);
  const celebrated = new Set<string>(
    ((logRows ?? []) as unknown as AnniversaryLogRow[]).map(
      (r) => `${r.member_id}|${r.brand_slug}|${r.milestone}`,
    ),
  );

  const brandSlugs = Array.from(new Set(follows.map((f) => f.brand_slug)));
  const { data: brandRows } = await admin
    .from("brands")
    .select("slug, name")
    .in("slug", brandSlugs);
  const brandNameBySlug = new Map<string, string>();
  for (const b of (brandRows ?? []) as unknown as BrandRow[]) {
    brandNameBySlug.set(b.slug, b.name);
  }

  let count = 0;
  let points = 0;
  for (const f of follows) {
    const alreadyForPair = new Set(
      MILESTONES.map((m) => m.key).filter((k) =>
        celebrated.has(`${f.member_id}|${f.brand_slug}|${k}`),
      ),
    );
    const due = dueMilestones(f.followed_at, alreadyForPair, now);
    for (const m of due) {
      const { error: insErr } = await admin
        .from("member_anniversary_log")
        .insert({
          member_id: f.member_id,
          brand_slug: f.brand_slug,
          milestone: m.key,
          points_awarded: m.points,
          metadata: {
            brand_name: brandNameBySlug.get(f.brand_slug) ?? f.brand_slug,
            label: m.label,
          },
        });
      if (insErr && insErr.code !== "23505") continue;
      if (insErr) continue; // already celebrated

      await admin.from("points_ledger").insert({
        member_id: f.member_id,
        community_id: f.brand_slug,
        delta: m.points,
        source: "anniversary",
        source_ref: m.key,
        note: `${m.label} with ${brandNameBySlug.get(f.brand_slug) ?? f.brand_slug}`,
      });
      try {
        await notifyAnniversary({
          memberId: f.member_id,
          brandSlug: f.brand_slug,
          brandName: brandNameBySlug.get(f.brand_slug) ?? f.brand_slug,
          label: m.label,
          points: m.points,
        });
      } catch {}

      count += 1;
      points += m.points;
    }
  }

  return { celebrated: count, pointsAwarded: points };
}
