import { createBrowserClient } from "@supabase/ssr";
import {
  AUTH_COOKIE_OPTIONS,
  hasBrowserSignedOutMarker,
} from "@/lib/auth-cookies";

/**
 * Supabase client for browser / client components.
 * `isSingleton: true` so header Sign out and the wizard share one cookie
 * jar — multiple createBrowserClient() instances were a session-bleed source.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Supabase client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const signedOut = hasBrowserSignedOutMarker();

  return createBrowserClient(url, anon, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    // Signed-out clients are throwaways so a later sign-up can mint a
    // persist-enabled singleton after the marker is cleared.
    isSingleton: !signedOut,
    auth: signedOut
      ? {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        }
      : undefined,
  });
}
