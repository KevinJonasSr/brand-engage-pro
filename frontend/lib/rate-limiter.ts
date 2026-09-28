/**
 * Rate limiter core, kept free of "@/" imports so node tests can load it.
 *
 * A limiter counts hits in a store. The shared store (Supabase, wired in
 * lib/rate-limit.ts) makes every Vercel instance count against the same
 * limit. If the shared store is missing or fails, the limiter falls back to
 * a per-instance memory store so a database hiccup never takes a route down.
 */
import { createHash } from "node:crypto";

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
}

/** One counted hit: the bucket's count after this hit and when it resets. */
export interface RateLimitHit {
  count: number;
  resetAt: number;
}

export type RateLimitStore = (
  key: string,
  config: RateLimitConfig,
) => Promise<RateLimitHit>;

const MEMORY_PRUNE_THRESHOLD = 5000;

/** Buckets are keyed by a hash so raw IPs and user ids are never stored. */
export function rateLimitKey(name: string, identifier: string): string {
  const digest = createHash("sha256").update(identifier).digest("hex");
  return `${name}:${digest}`;
}

/** Per-instance store, used in tests, locally, and as the fallback. */
export function createMemoryStore(now: () => number = Date.now): RateLimitStore {
  const buckets = new Map<string, RateLimitHit>();

  const prune = (at: number) => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= at) buckets.delete(key);
    }
  };

  return async (key, config) => {
    const at = now();
    if (buckets.size > MEMORY_PRUNE_THRESHOLD) prune(at);

    const current = buckets.get(key);
    const next: RateLimitHit =
      !current || current.resetAt <= at
        ? { count: 1, resetAt: at + config.windowMs }
        : { count: current.count + 1, resetAt: current.resetAt };
    buckets.set(key, next);
    return next;
  };
}

export class RateLimiter {
  private readonly name: string;
  private readonly config: RateLimitConfig;
  private readonly getStore: () => RateLimitStore | null;
  private readonly fallback: RateLimitStore;

  constructor(
    name: string,
    config: RateLimitConfig,
    getStore: () => RateLimitStore | null = () => null,
    fallback?: RateLimitStore,
  ) {
    this.name = name;
    this.config = config;
    this.getStore = getStore;
    this.fallback = fallback ?? createMemoryStore();
  }

  async check(identifier: string): Promise<RateLimitResult> {
    const key = rateLimitKey(this.name, identifier);
    const hit = await this.hit(key);
    return {
      success: hit.count <= this.config.maxRequests,
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - hit.count),
      resetTime: new Date(hit.resetAt),
    };
  }

  private async hit(key: string): Promise<RateLimitHit> {
    const store = this.getStore();
    if (!store) return this.fallback(key, this.config);
    try {
      return await store(key, this.config);
    } catch (err) {
      console.error(`[rate-limit] shared store failed for ${this.name}, using memory`, err);
      return this.fallback(key, this.config);
    }
  }
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;
  return "127.0.0.1";
}
