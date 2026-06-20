/**
 * Simple in-memory rate limiter for Next.js API routes.
 * Tracks requests per IP address with a sliding window approach.
 * Works both in Vercel Edge and Node.js runtimes.
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private store = new Map<string, RateLimitRecord>();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (record.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  check(identifier: string): {
    success: boolean;
    limit: number;
    remaining: number;
    resetTime: Date;
  } {
    const now = Date.now();
    let record = this.store.get(identifier);

    if (!record || record.resetTime < now) {
      record = { count: 0, resetTime: now + this.config.windowMs };
      this.store.set(identifier, record);
    }

    record.count++;

    return {
      success: record.count <= this.config.maxRequests,
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - record.count),
      resetTime: new Date(record.resetTime),
    };
  }
}

export const authRateLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
});

export const memberDataRateLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: 60 * 1000,
});

export const apiRateLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: 60 * 1000,
});

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;
  return "127.0.0.1";
}
