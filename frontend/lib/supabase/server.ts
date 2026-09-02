import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  AUTH_COOKIE_OPTIONS,
  SIGNED_OUT_COOKIE,
  isAuthCookieName,
  isSignedOutMarkerValue,
} from "@/lib/auth-cookies";

/**
 * Supabase client for server components, route handlers, and server actions.
 * Cookie options stay host-only (no Domain=) so www and apex do not mint
 * a second sb-* cookie that can swap walk accounts after logout.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Supabase server client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const cookieStore = await cookies();
  const signedOut = isSignedOutMarkerValue(
    cookieStore.get(SIGNED_OUT_COOKIE)?.value,
  );

  return createServerClient(url, anon, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        const all = cookieStore.getAll();
        // Hide leftover sb-* after Sign out so layout/signup getUser()
        // cannot resurrect N24 onto /signup mid-form.
        if (signedOut) {
          return all.filter((cookie) => !isAuthCookieName(cookie.name));
        }
        return all;
      },
      setAll(cookiesToSet) {
        if (signedOut) return;
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...AUTH_COOKIE_OPTIONS,
              ...options,
              // Never write Domain=.brandengagepro.com from the app.
              domain: undefined,
            }),
          );
        } catch {
          // setAll can be called from a server component where cookies cannot be
          // mutated; safe to ignore because middleware refreshes sessions anyway.
        }
      },
    },
  });
}
