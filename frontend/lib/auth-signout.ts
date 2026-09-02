import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRelativePath } from "@/lib/safe-redirect";

/**
 * Shared sign-out for /logout, /signout, and /auth/signout.
 * Always redirects (303) so these doors never 404. GET and POST both work
 * (bookmark / typed URL vs the account-menu form).
 */
export async function signOutAndRedirect(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Still leave the page — a missing session or unset env must not 404.
  }
  const next = safeRelativePath(request.nextUrl.searchParams.get("next"), "/");
  return NextResponse.redirect(new URL(next, request.url), { status: 303 });
}
