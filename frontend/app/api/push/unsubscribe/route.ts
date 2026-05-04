import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/push/unsubscribe
 *
 * Body: { endpoint }
 *
 * Removes a single device's subscription. If this was the member's last
 * subscription, also flips `push_enabled = false` so we don't keep
 * trying to send when there's nowhere to deliver.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const endpoint = body.endpoint;
  if (!endpoint) {
    return NextResponse.json({ error: "missing_endpoint" }, { status: 400 });
  }

  const admin = createAdminClient();
  await admin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("member_id", user.id);

  const { count } = await admin
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("member_id", user.id);

  if (!count || count === 0) {
    await admin
      .from("notification_preferences")
      .update({ push_enabled: false, updated_at: new Date().toISOString() })
      .eq("member_id", user.id);
  }

  return NextResponse.json({ ok: true });
}
