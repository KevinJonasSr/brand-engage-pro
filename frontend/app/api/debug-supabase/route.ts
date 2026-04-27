import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * TEMPORARY diagnostic route — DELETE before public launch.
 *
 * Surfaces:
 *   1. env: which Supabase project we're connected to + key prefixes
 *   2. brands query: count + nellies row + raw PostgREST probe
 *   3. auth probe: list-users via service_role (proves we can reach
 *      auth.users at all and surfaces any auth schema RLS/grant issues)
 *   4. signup dry-run: attempts a fake-domain signup just to see what
 *      error code comes back from Supabase Auth — Auth will reject the
 *      fake domain after triggers + checks have run, which is exactly
 *      where the previous "Database error saving new user" failure
 *      surfaced. We can read the message without leaving a real user.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(missing)";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "(missing)";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "(missing)";

  const result: Record<string, unknown> = {
    urlPrefix: url.slice(0, 35),
    anonKeyPrefix: anon.slice(0, 12),
    servicePrefix: service.slice(0, 12),
    anonKeyLen: anon.length,
    serviceKeyLen: service.length,
  };

  // 1. Brands query — proven path from the earlier GRANT bug.
  try {
    const supabase = await createClient();
    const { count, error: countErr } = await supabase
      .from("brands")
      .select("*", { count: "exact", head: true });
    result.brandsCount = countErr
      ? { error: { message: countErr.message, code: countErr.code } }
      : { count };
  } catch (e) {
    result.clientThrew = String(e);
  }

  // 2. Auth admin probe — list users via service role. Proves we can
  //    reach auth.users at all. If service_role key is wrong this fails
  //    with a 401.
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1 });
    result.authListUsers = error
      ? { error: { message: error.message, status: error.status } }
      : { totalProbed: data?.users?.length ?? 0 };
  } catch (e) {
    result.authAdminThrew = String(e);
  }

  // 3. Signup dry-run — uses a syntactically-valid email at a fake
  //    domain. Supabase Auth runs all the on_auth_user_created triggers
  //    BEFORE deciding whether to send the confirmation email, so any
  //    handle_new_member / handle_new_fan trigger that's broken will
  //    surface here as "Database error saving new user".
  //
  //    We use a unique random local-part so this never collides with an
  //    existing user. The fake domain means no real email is delivered.
  try {
    const supabase = await createClient();
    const probeEmail = `bep-probe+${Date.now()}@example-debug.invalid`;
    const { data, error } = await supabase.auth.signUp({
      email: probeEmail,
      password: `Probe-${Date.now()}-x9!`,
    });
    result.signupProbe = error
      ? {
          error: {
            message: error.message,
            status: error.status,
            code: (error as { code?: string }).code ?? null,
          },
        }
      : {
          emailUsed: probeEmail,
          userCreated: !!data?.user,
          sessionCreated: !!data?.session,
          identitiesCount: data?.user?.identities?.length ?? 0,
        };
  } catch (e) {
    result.signupProbeThrew = String(e);
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
