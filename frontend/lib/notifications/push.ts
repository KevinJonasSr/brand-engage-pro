import { createAdminClient } from "@/lib/supabase/admin";
import { loadVapid } from "./vapid";
import type { PushPayload, PushSubscriptionRow } from "./types";

/**
 * Send a Web Push notification to all of a member's subscribed devices.
 *
 * Returns { sent, failed, expired } counts. Expired subscriptions
 * (HTTP 404/410 from the push service) are auto-deleted from
 * push_subscriptions so we don't keep retrying dead endpoints.
 *
 * Failure mode: if VAPID keys are missing or the web-push package fails
 * to load, returns a benign zero-state. Never throws — the caller
 * should never have to wrap this.
 */
export async function sendPush(
  memberId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number; expired: number }> {
  const result = { sent: 0, failed: 0, expired: 0 };
  const vapid = loadVapid();
  if (!vapid) return result;

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, member_id, endpoint, p256dh, auth, user_agent, created_at, last_used_at")
    .eq("member_id", memberId);

  if (!subs || subs.length === 0) return result;

  let webpush: typeof import("web-push");
  try {
    webpush = await import("web-push");
  } catch (err) {
    console.warn("sendPush: web-push package not installed, skipping", err);
    return result;
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  // Default icon + badge from public/. If you don't have these assets,
  // most browsers render a generic bell. Fine for V1.
  const fullPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    icon: payload.icon ?? "/icon-192.png",
    badge: payload.badge ?? "/badge-72.png",
    tag: payload.tag,
    data: payload.data ?? {},
  });

  const expiredIds: string[] = [];

  await Promise.all(
    (subs as PushSubscriptionRow[]).map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          fullPayload,
        );
        result.sent += 1;
        // Don't await — best-effort timestamp update
        admin
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", sub.id)
          .then(() => {});
      } catch (err: unknown) {
        const status =
          (err as { statusCode?: number; status?: number })?.statusCode ??
          (err as { statusCode?: number; status?: number })?.status;
        if (status === 404 || status === 410) {
          expiredIds.push(sub.id);
          result.expired += 1;
        } else {
          console.warn("sendPush: failed for sub", sub.id, err);
          result.failed += 1;
        }
      }
    }),
  );

  if (expiredIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", expiredIds);
  }

  return result;
}
