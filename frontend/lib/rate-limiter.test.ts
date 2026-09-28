import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RateLimiter,
  createMemoryStore,
  getClientIp,
  rateLimitKey,
  type RateLimitStore,
} from "./rate-limiter.ts";

function src(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const CONFIG = { maxRequests: 2, windowMs: 1000 };

function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  return fn().finally(() => {
    console.error = original;
  });
}

describe("rateLimitKey", () => {
  it("prefixes the limiter name and hashes the caller id", () => {
    const key = rateLimitKey("api", "203.0.113.7");
    assert.match(key, /^api:[0-9a-f]{64}$/);
    assert.doesNotMatch(key, /203\.0\.113\.7/);
  });

  it("is stable per caller and differs across callers", () => {
    assert.equal(rateLimitKey("api", "a"), rateLimitKey("api", "a"));
    assert.notEqual(rateLimitKey("api", "a"), rateLimitKey("api", "b"));
    assert.notEqual(rateLimitKey("api", "a"), rateLimitKey("auth", "a"));
  });
});

describe("RateLimiter with the memory store", () => {
  it("allows up to the limit, then denies", async () => {
    const limiter = new RateLimiter("t", CONFIG);
    assert.equal((await limiter.check("u")).success, true);
    const second = await limiter.check("u");
    assert.equal(second.success, true);
    assert.equal(second.remaining, 0);
    const third = await limiter.check("u");
    assert.equal(third.success, false);
    assert.equal(third.limit, 2);
    assert.equal(third.remaining, 0);
  });

  it("counts callers separately", async () => {
    const limiter = new RateLimiter("t", CONFIG);
    await limiter.check("a");
    await limiter.check("a");
    assert.equal((await limiter.check("a")).success, false);
    assert.equal((await limiter.check("b")).success, true);
  });

  it("starts a new window once the old one ends", async () => {
    let now = 10_000;
    const limiter = new RateLimiter("t", CONFIG, () => null, createMemoryStore(() => now));
    await limiter.check("u");
    await limiter.check("u");
    const denied = await limiter.check("u");
    assert.equal(denied.success, false);
    assert.equal(denied.resetTime.getTime(), 11_000);
    now = 11_000;
    const fresh = await limiter.check("u");
    assert.equal(fresh.success, true);
    assert.equal(fresh.remaining, 1);
    assert.equal(fresh.resetTime.getTime(), 12_000);
  });
});

describe("RateLimiter with a shared store", () => {
  it("uses the shared store's count and reset time", async () => {
    const seen: string[] = [];
    const store: RateLimitStore = async (key) => {
      seen.push(key);
      return { count: 3, resetAt: 5000 };
    };
    const limiter = new RateLimiter("api", CONFIG, () => store);
    const result = await limiter.check("user-1");
    assert.equal(result.success, false);
    assert.equal(result.resetTime.getTime(), 5000);
    assert.deepEqual(seen, [rateLimitKey("api", "user-1")]);
  });

  it("falls back to memory when the shared store throws", async () => {
    const store: RateLimitStore = async () => {
      throw new Error("db down");
    };
    const limiter = new RateLimiter("api", CONFIG, () => store);
    const results = await quietly(async () => [
      await limiter.check("u"),
      await limiter.check("u"),
      await limiter.check("u"),
    ]);
    assert.deepEqual(
      results.map((r) => r.success),
      [true, true, false],
    );
  });
});

describe("getClientIp", () => {
  it("takes the first x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    assert.equal(getClientIp(headers), "203.0.113.7");
  });

  it("falls back to x-real-ip, then loopback", () => {
    assert.equal(getClientIp(new Headers({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
    assert.equal(getClientIp(new Headers()), "127.0.0.1");
  });
});

describe("shared limiter wiring", () => {
  const wrapper = src("./rate-limit.ts");

  it("calls rate_limit_hit through the service role client", () => {
    assert.match(wrapper, /createAdminClient\(\)/);
    assert.match(wrapper, /\.rpc\("rate_limit_hit", \{\s+p_key: key,\s+p_window_ms: config\.windowMs,/);
    assert.match(wrapper, /if \(error\) throw/);
  });

  it("keeps the same limits", () => {
    const limits: [string, string][] = [
      ["authRateLimiter", "maxRequests: 5,\\s+windowMs: 15 \\* 60 \\* 1000"],
      ["memberDataRateLimiter", "maxRequests: 30,\\s+windowMs: 60 \\* 1000"],
      ["apiRateLimiter", "maxRequests: 60,\\s+windowMs: 60 \\* 1000"],
      ["welcomeSmsRateLimiter", "maxRequests: 3,\\s+windowMs: 60 \\* 60 \\* 1000"],
      ["brandApplyRateLimiter", "maxRequests: 5,\\s+windowMs: 60 \\* 60 \\* 1000"],
    ];
    for (const [name, body] of limits) {
      assert.match(wrapper, new RegExp(`export const ${name} = limiter\\("[a-z-]+", \\{\\s+${body},`), name);
    }
  });

  it("every caller awaits check", () => {
    const callers = [
      "../app/api/member-engage/sms/route.ts",
      "../app/api/turnstile/verify/route.ts",
      "../app/for-brands/apply/actions.ts",
      "../app/api/ai/draft-comment/route.ts",
      "../app/api/checkin/route.ts",
      "../app/api/member-engage/mailchimp/route.ts",
      "../app/api/search/route.ts",
      "../app/api/ai/caption-image/route.ts",
    ];
    for (const path of callers) {
      const code = src(path);
      const calls = code.match(/RateLimiter\.check\(/g) ?? [];
      const awaited = code.match(/await \w+RateLimiter\.check\(/g) ?? [];
      assert.ok(calls.length > 0, `${path} has no limiter call`);
      assert.equal(awaited.length, calls.length, path);
    }
  });
});

describe("0069 shared rate limits migration", () => {
  const sql = src("../../supabase/migrations/0069_shared_rate_limits.sql");

  it("locks the table to service_role", () => {
    assert.match(sql, /alter table public\.rate_limits enable row level security;/);
    assert.match(sql, /revoke all on table public\.rate_limits from public, anon, authenticated;/);
    assert.match(sql, /grant select, insert, update, delete on table public\.rate_limits to service_role;/);
    assert.doesNotMatch(sql, /create policy/);
  });

  it("is an invoker function with a pinned search_path, service_role only", () => {
    assert.match(sql, /security invoker\s+set search_path to 'public'/);
    assert.doesNotMatch(sql, /security definer/);
    assert.match(sql, /revoke all on function public\.rate_limit_hit\(text, integer\) from public, anon, authenticated;/);
    assert.match(sql, /grant execute on function public\.rate_limit_hit\(text, integer\) to service_role;/);
  });

  it("resets expired buckets inside one atomic upsert", () => {
    assert.match(sql, /on conflict \(key\) do update/);
    assert.match(sql, /case when rl\.reset_at <= now\(\) then 1 else rl\.count \+ 1 end/);
  });
});
