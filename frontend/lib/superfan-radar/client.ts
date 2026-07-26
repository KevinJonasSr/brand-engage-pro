import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for the Fan Analytics Dashboard / Super Fan
 * Radar project — a completely separate Supabase project from BEP's own
 * (ref ysekxezezkucynjyvjwr vs. enfpviapxvqyoarwwsuf). Read-only usage only.
 *
 * NEVER import this into client components or expose the service role key.
 * Only for server-side privileged reads (admin surface).
 */
export function createSuperFanRadarClient() {
  const url = process.env.FAD_SUPABASE_URL || "https://ysekxezezkucynjyvjwr.supabase.co";
  const serviceKey = process.env.FAD_SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error(
      "Super Fan Radar client is not configured. Set FAD_SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
