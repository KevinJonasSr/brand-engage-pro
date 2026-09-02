import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRelativePath } from "@/lib/safe-redirect";
import {
  clearOnboardedCookie,
  expireAuthCookiesOnResponse,
  stampSignedOutCookie,
} from "@/lib/auth-cookies";

/**
 * Shared sign-out for /logout, /signout, and /auth/signout.
 * Always redirects (303) so these doors never 404. GET and POST both work.
 *
 * Cookie clears are written onto THIS redirect response (append Set-Cookie
 * for host-only + parent domain). `cookies().set()` from the Supabase
 * client is not enough when leftover chunks / Domain=.brandengagepro.com
 * cookies remain — those resurrect on the next `/` via proxy getUser().
 */
export async function signOutAndRedirect(request: NextRequest): Promise<NextResponse> {
  const next = safeRelativePath(request.nextUrl.searchParams.get("next"), "/");
  const response = NextResponse.redirect(new URL(next, request.url), { status: 303 });

  try {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    // Still leave the page — a missing session or unset env must not 404.
  }

  expireAuthCookiesOnResponse(
    response,
    request.cookies.getAll().map((cookie) => cookie.name),
    request.nextUrl.hostname,
  );
  stampSignedOutCookie(response, request.nextUrl.hostname);
  clearOnboardedCookie(response, request.nextUrl.hostname);
  return response;
}
