/**
 * Rate limiters for API routes and server actions.
 *
 * Counts live in the shared public.rate_limits table (migration 0069), so
 * every Vercel instance enforces the same limit. When the service role env
 * vars are missing, or the database call fails, each limiter falls back to
 * per-instance memory (see lib/rate-limiter.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RateLimiter,
  type RateLimitConfig,
  type RateLimitHit,
  type RateLimitStore,
} from "@/lib/rate-limiter";

export { getClientIp } from "@/lib/rate-limiter";

let adminClient: SupabaseClient | null = null;

function supabaseStore(): RateLimitStore | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  adminClient ??= createAdminClient();
  const client = adminClient;

  return async (key: string, config: RateLimitConfig): Promise<RateLimitHit> => {
    const { data, error } = await client.rpc("rate_limit_hit", {
      p_key: key,
      p_window_ms: config.windowMs,
    });
    if (error) throw new Error(`rate_limit_hit failed: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.hit_count !== "number" || !row.reset_at) {
      throw new Error("rate_limit_hit returned no row");
    }
    return { count: row.hit_count, resetAt: new Date(row.reset_at).getTime() };
  };
}

function limiter(name: string, config: RateLimitConfig): RateLimiter {
  return new RateLimiter(name, config, supabaseStore);
}

export const authRateLimiter = limiter("auth", {
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
});

export const memberDataRateLimiter = limiter("member-data", {
  maxRequests: 30,
  windowMs: 60 * 1000,
});

export const apiRateLimiter = limiter("api", {
  maxRequests: 60,
  windowMs: 60 * 1000,
});

/** Welcome texts: a few per member per hour, so the route cannot spam a phone. */
export const welcomeSmsRateLimiter = limiter("welcome-sms", {
  maxRequests: 3,
  windowMs: 60 * 60 * 1000,
});

/** Public brand applications: a handful per IP per hour. */
export const brandApplyRateLimiter = limiter("brand-apply", {
  maxRequests: 5,
  windowMs: 60 * 60 * 1000,
});
