import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "../send";

/**
 * Notify followers of a brand when a limited-time drop goes live. Works
 * for both reward drops AND special drops — caller passes `targetType`
 * and the URL routes to the right place per kind.
 *
 * Uses the existing `notify_drops` preference flag from Phase 2 — members
 * who opted out of drop pushes won't be paged.
 *
 * Caller (the drops-notifier cron) is responsible for:
 *   - Selecting rows where drops_at just crossed
 *   - Inserting the (target_type, target_id, kind='launched') dedupe row
 *
 * This function is the per-target fan-out only.
 */
export async function notifyDropLaunched(opts: {
  targetType: "reward" | "special";
  targetId: string;
  brandSlug: string;
  title: string;
  description?: string | null;
  expiresAt?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: brand } = await admin
      .from("brands")
      .select("name")
      .eq("slug", opts.brandSlug)
      .maybeSingle();
    if (!brand) return;

    const { data: follows } = await admin
      .from("member_brand_following")
      .select("member_id")
      .eq("brand_slug", opts.brandSlug);
    const memberIds = (follows ?? []).map((r) => r.member_id as string);
    if (memberIds.length === 0) return;

    const desc = opts.description
      ? String(opts.description).slice(0, 80)
      : null;
    const body = desc
      ? `${opts.title} — ${desc}`
      : `${opts.title} just dropped.`;

    // URL routes per target type. Both live under the brand page in BEP —
    // rewards under /rewards, specials inline on the brand home page
    // (with the special's id as the anchor).
    const url =
      opts.targetType === "reward"
        ? `/brands/${opts.brandSlug}/rewards`
        : `/brands/${opts.brandSlug}#special-${opts.targetId}`;

    const labelPrefix =
      opts.targetType === "reward" ? "new drop" : "new special";

    const MAX_CONCURRENT = 200;
    await Promise.all(
      memberIds.slice(0, MAX_CONCURRENT).map((memberId) =>
        sendNotification({
          memberId,
          type: "drops",
          payload: {
            title: `${brand.name as string} — ${labelPrefix}`,
            body,
            url,
            tag: `drop_launched:${opts.targetType}:${opts.targetId}`,
          },
        }),
      ),
    );
  } catch (err) {
    console.warn("notifyDropLaunched failed (non-blocking):", err);
  }
}

/**
 * Notify followers ~1 hour before a drop expires. Same member fan-out
 * pattern as notifyDropLaunched. For reward drops, skips members who
 * already redeemed; for specials, the redemption-skip step is a no-op
 * (specials are not redeemable in the loyalty-rewards sense).
 */
export async function notifyDropExpiring(opts: {
  targetType: "reward" | "special";
  targetId: string;
  brandSlug: string;
  title: string;
  expiresAt: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    const [{ data: brand }, { data: follows }, { data: redemptions }] =
      await Promise.all([
        admin
          .from("brands")
          .select("name")
          .eq("slug", opts.brandSlug)
          .maybeSingle(),
        admin
          .from("member_brand_following")
          .select("member_id")
          .eq("brand_slug", opts.brandSlug),
        opts.targetType === "reward"
          ? admin
              .from("reward_redemptions")
              .select("member_id")
              .eq("reward_id", opts.targetId)
              .neq("status", "cancelled")
          : Promise.resolve({ data: [] as { member_id: string }[] }),
      ]);

    if (!brand) return;

    const followerIds = (follows ?? []).map((r) => r.member_id as string);
    const alreadyRedeemed = new Set<string>(
      (redemptions ?? []).map((r) => r.member_id as string),
    );
    const targets = followerIds.filter((id) => !alreadyRedeemed.has(id));
    if (targets.length === 0) return;

    const expiresMs = new Date(opts.expiresAt).getTime();
    const minutesLeft = Math.max(
      1,
      Math.round((expiresMs - Date.now()) / 60000),
    );

    const url =
      opts.targetType === "reward"
        ? `/brands/${opts.brandSlug}/rewards`
        : `/brands/${opts.brandSlug}#special-${opts.targetId}`;

    const callToAction =
      opts.targetType === "reward"
        ? `Last ${minutesLeft} min to redeem this drop.`
        : `Last ${minutesLeft} min on this special.`;

    const MAX_CONCURRENT = 200;
    await Promise.all(
      targets.slice(0, MAX_CONCURRENT).map((memberId) =>
        sendNotification({
          memberId,
          type: "drops",
          payload: {
            title: `${opts.title} ends soon`,
            body: callToAction,
            url,
            tag: `drop_expiring:${opts.targetType}:${opts.targetId}`,
          },
        }),
      ),
    );
  } catch (err) {
    console.warn("notifyDropExpiring failed (non-blocking):", err);
  }
}
