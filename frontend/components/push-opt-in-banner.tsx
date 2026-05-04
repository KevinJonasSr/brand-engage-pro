import { createClient } from "@/lib/supabase/server";
import PushOptInPrompt from "@/components/push-opt-in-prompt";

/**
 * Server-side wrapper for PushOptInPrompt. Resolves the VAPID public key
 * (from env) and whether the current member already has any active push
 * subscriptions, then hands those into the client component.
 *
 * Renders nothing if:
 *   - VAPID env var is missing (Phase 2 not configured yet)
 *   - There's no signed-in user
 *   - The user already has at least one active subscription
 */
export default async function PushOptInBanner() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
  if (!vapidPublicKey) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("member_id", user.id);
  if (count && count > 0) return null;

  return (
    <PushOptInPrompt
      vapidPublicKey={vapidPublicKey}
      alreadySubscribed={false}
    />
  );
}
