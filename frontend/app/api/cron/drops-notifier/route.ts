import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  notifyDropExpiring,
  notifyDropLaunched,
} from "@/lib/notifications/triggers/drop";

/**
 * Cron: GET /api/cron/drops-notifier
 *
 * Fires push notifications for limited-time drops on BOTH `rewards_catalog`
 * AND `specials`. Two kinds of pushes per target type:
 *
 *   1. LAUNCHED — drops_at just passed (≤ 30 min ago) and we haven't
 *      already fired the launched notification.
 *   2. EXPIRING — expires_at is within the next 75 min and we haven't
 *      already fired the 1-hour-warning. Slack of 75 min covers a
 *      worst-case 15-min cron schedule slip.
 *
 * Idempotent via the generic `drop_notifications` dedupe table keyed on
 * (target_type, target_id, kind).
 *
 * Called from vercel.json on the every-15-min schedule.
 *
 * Auth: requires CRON_SECRET in the Authorization: Bearer <secret> header.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LAUNCHED_LOOKBACK_MS = 30 * 60 * 1000;       // 30 min
const EXPIRING_LOOKAHEAD_MS = 75 * 60 * 1000;      // 75 min

type TargetType = "reward" | "special";

interface DropRow {
  id: string;
  title: string;
  description?: string | null;
  community_id: string | null;       // brand_slug for specials/rewards
  drops_at: string | null;
  expires_at: string | null;
  is_drop: boolean;
  active: boolean;
}

const TABLE_FOR: Record<TargetType, string> = {
  reward: "rewards_catalog",
  special: "specials",
};

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const now = new Date();
  const launchedAfter = new Date(now.getTime() - LAUNCHED_LOOKBACK_MS).toISOString();
  const expiringBefore = new Date(now.getTime() + EXPIRING_LOOKAHEAD_MS).toISOString();
  const nowIso = now.toISOString();

  const result = {
    rewards: { launched: { fired: 0, skipped: 0 }, expiring: { fired: 0, skipped: 0 } },
    specials: { launched: { fired: 0, skipped: 0 }, expiring: { fired: 0, skipped: 0 } },
    errors: [] as string[],
  };

  for (const targetType of ["reward", "special"] as TargetType[]) {
    const table = TABLE_FOR[targetType];
    const bucket =
      targetType === "reward" ? result.rewards : result.specials;

    // ── 1. Newly-launched drops ────────────────────────────────────────
    try {
      const { data: justLaunched } = await admin
        .from(table)
        .select(
          "id, title, description, community_id, drops_at, expires_at, active, is_drop",
        )
        .eq("is_drop", true)
        .eq("active", true)
        .gte("drops_at", launchedAfter)
        .lte("drops_at", nowIso);

      for (const row of (justLaunched ?? []) as DropRow[]) {
        const targetId = row.id;
        const brandSlug = row.community_id;
        if (!brandSlug) {
          bucket.launched.skipped += 1;
          continue;
        }

        // Dedupe — try-insert; if conflict, skip.
        const { error: dedupeErr } = await admin
          .from("drop_notifications")
          .insert({ target_type: targetType, target_id: targetId, kind: "launched" });
        if (dedupeErr) {
          bucket.launched.skipped += 1;
          continue;
        }

        await notifyDropLaunched({
          targetType,
          targetId,
          brandSlug,
          title: row.title,
          description: row.description ?? null,
          expiresAt: row.expires_at,
        });
        bucket.launched.fired += 1;
      }
    } catch (err) {
      result.errors.push(
        `${targetType} launched: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // ── 2. Drops expiring in ~1 hour ──────────────────────────────────
    try {
      const { data: expiringSoon } = await admin
        .from(table)
        .select(
          "id, title, community_id, expires_at, active, is_drop, drops_at",
        )
        .eq("is_drop", true)
        .eq("active", true)
        .gt("expires_at", nowIso)
        .lte("expires_at", expiringBefore);

      for (const row of (expiringSoon ?? []) as DropRow[]) {
        const targetId = row.id;
        const brandSlug = row.community_id;
        const expiresAt = row.expires_at;
        if (!brandSlug || !expiresAt) {
          bucket.expiring.skipped += 1;
          continue;
        }
        // Don't fire expiring before drops_at — handles the edge case
        // of an admin creating a 30-min-window drop.
        if (row.drops_at && new Date(row.drops_at).getTime() > now.getTime()) {
          bucket.expiring.skipped += 1;
          continue;
        }

        const { error: dedupeErr } = await admin
          .from("drop_notifications")
          .insert({ target_type: targetType, target_id: targetId, kind: "expiring" });
        if (dedupeErr) {
          bucket.expiring.skipped += 1;
          continue;
        }

        await notifyDropExpiring({
          targetType,
          targetId,
          brandSlug,
          title: row.title,
          expiresAt,
        });
        bucket.expiring.fired += 1;
      }
    } catch (err) {
      result.errors.push(
        `${targetType} expiring: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return NextResponse.json({ ok: true, ...result, ranAt: nowIso });
}
