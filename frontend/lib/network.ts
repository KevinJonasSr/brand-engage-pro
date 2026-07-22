import "server-only";
import { createNetworkClient, type NetworkEvent } from "@/lib/network-client";

// Jonas Network emitter for brand_engage. The publisher key authenticates us
// to the hub's network_ingest_event RPC and must never reach the browser —
// only call this from route handlers / server actions / lib/data helpers.
//
// No-ops when env vars are absent so the app still builds and boots with
// zero configuration.
//
// Currently emitted events (dedupe prefix `be:`):
//   reward.redeemed    — lib/data/rewards.ts
//   event.checkin      — lib/data/checkins.ts
//   referral.converted — app/api/member-engage/onboard/route.ts
//
// Adding a new event (sales, reviews, ...) is one call at the server-side
// point where the thing happens:
//   emitNetworkEvent({
//     event_type: "purchase.completed",        // see lib/network-client/types.ts
//     local_actor_id: memberId,
//     artist_slug: communityId,                // the brand slug
//     entity_type: "purchase", entity_id: id,
//     dedupe_key: `be:purchase:${id}`,         // unique per real-world event
//     metadata: { ... },
//   });

export function emitNetworkEvent(event: NetworkEvent): void {
  const anonKey = process.env.NETWORK_HUB_ANON_KEY;
  const publisherKey = process.env.NETWORK_PUBLISHER_KEY;
  if (!anonKey || !publisherKey) return;

  const client = createNetworkClient({ anonKey, publisherKey });
  // Fire-and-forget: emit() never throws, and a hub outage must never
  // slow down or break a member-facing flow.
  void client.emit(event);
}
