"use client";

import { createClient } from "@/lib/supabase/client";
import {
  clearBrowserAuthStorage,
  clearBrowserOnboarded,
  stampBrowserSignedOut,
} from "@/lib/auth-cookies";

/**
 * Header Sign out: wipe every sb-* store the browser can see, revoke the
 * refresh token, then hard-navigate the GET `/logout` door so the server
 * expires HttpOnly / other-domain leftovers. `replace` avoids a Back
 * button resurrect from the signed-in page.
 */
export async function hardSignOut(): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    // still clear local stores and hit the GET door
  }
  clearBrowserAuthStorage();
  stampBrowserSignedOut();
  clearBrowserOnboarded();
  window.location.replace("/logout");
}
