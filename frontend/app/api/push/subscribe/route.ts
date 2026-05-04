import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/push/subscribe
 *
 * Body: { endpoint, keys: { p256dh, auth }, userAgent? }
 *
 * Stores (or refreshes) a push subscription for the signed-in member and
 * flips `notification_preferences.push_enabled = true` if it wasn't
 * already. Idempotent — same endpoint upserts.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Upsert by endpoint — same device subscribing twice should refresh
  // not duplicate.
  const { error: subError } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        member_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: body.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
  if (subError) {
    return NextResponse.json({ error: subError.message }, { status: 500 });
  }

  // Flip the master push toggle on. Granular notify_* flags keep their
  // defaults (all true).
  await admin.from("notification_preferences").upsert(
    {
      member_id: user.id,
      push_enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "member_id" },
  );

  return NextResponse.json({ ok: true });
}
