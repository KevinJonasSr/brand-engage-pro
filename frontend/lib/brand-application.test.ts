import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BRAND_APPLICATION_ERROR_MESSAGES,
  BRAND_APPLICATION_LIMITS,
  isHttpUrl,
  parseBrandApplication,
} from "./brand-application.ts";
import { isApplyTurnstileEnabled, verifyApplyTurnstile } from "./brand-apply-turnstile.ts";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const REQUIRED = {
  display_name: "Nellie's Southern Kitchen",
  contact_name: "Pat Owner",
  contact_email: "Pat@Example.com",
};

function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("parseBrandApplication", () => {
  it("accepts a minimal valid application and normalises the email", () => {
    const result = parseBrandApplication(form(REQUIRED));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.row.contact_email, "pat@example.com");
    assert.deepEqual(result.row.social, []);
    assert.equal(result.row.has_street_team, false);
    assert.equal(result.row.location_count, null);
  });

  it("rejects missing required fields", () => {
    const result = parseBrandApplication(form({ ...REQUIRED, contact_name: "   " }));
    assert.deepEqual(result, { ok: false, error: "missing-required" });
  });

  it("rejects fields over their length limit", () => {
    const bio = "a".repeat(BRAND_APPLICATION_LIMITS.bio + 1);
    assert.deepEqual(parseBrandApplication(form({ ...REQUIRED, bio })), {
      ok: false,
      error: "too-long",
    });
  });

  it("rejects bad emails, phones, slugs and categories", () => {
    assert.deepEqual(parseBrandApplication(form({ ...REQUIRED, contact_email: "nope" })), {
      ok: false,
      error: "invalid-email",
    });
    assert.deepEqual(
      parseBrandApplication(form({ ...REQUIRED, contact_phone: "call me maybe" })),
      { ok: false, error: "invalid-phone" },
    );
    assert.deepEqual(
      parseBrandApplication(form({ ...REQUIRED, slug_suggestion: "Bad Slug!" })),
      { ok: false, error: "invalid-slug" },
    );
    assert.deepEqual(parseBrandApplication(form({ ...REQUIRED, category: "casino" })), {
      ok: false,
      error: "invalid-category",
    });
  });

  it("only accepts http(s) links for socials and the hero image", () => {
    assert.deepEqual(
      parseBrandApplication(form({ ...REQUIRED, social_instagram: "javascript:alert(1)" })),
      { ok: false, error: "invalid-url" },
    );
    assert.deepEqual(
      parseBrandApplication(form({ ...REQUIRED, hero_image: "not a url" })),
      { ok: false, error: "invalid-url" },
    );
    const ok = parseBrandApplication(
      form({ ...REQUIRED, social_instagram: "https://instagram.com/nellies" }),
    );
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.deepEqual(ok.row.social, [
        { label: "Instagram", href: "https://instagram.com/nellies" },
      ]);
    }
    assert.equal(isHttpUrl("ftp://x.com"), false);
  });

  it("bounds integer fields", () => {
    assert.deepEqual(parseBrandApplication(form({ ...REQUIRED, location_count: "0" })), {
      ok: false,
      error: "invalid-number",
    });
    assert.deepEqual(parseBrandApplication(form({ ...REQUIRED, years_in_business: "-3" })), {
      ok: false,
      error: "invalid-number",
    });
    assert.deepEqual(
      parseBrandApplication(form({ ...REQUIRED, monthly_transactions: "1e9" })),
      { ok: false, error: "invalid-number" },
    );
    const ok = parseBrandApplication(form({ ...REQUIRED, location_count: "3" }));
    assert.equal(ok.ok && ok.row.location_count, 3);
  });

  it("rejects control characters but allows newlines in long text", () => {
    assert.deepEqual(
      parseBrandApplication(form({ ...REQUIRED, tagline: "hi\u0000there" })),
      { ok: false, error: "invalid-text" },
    );
    assert.equal(
      parseBrandApplication(form({ ...REQUIRED, community_pitch: "line one\nline two" })).ok,
      true,
    );
  });

  it("has a plain-English message for every error code the action can send", () => {
    for (const code of [
      "missing-required",
      "too-long",
      "invalid-email",
      "invalid-phone",
      "invalid-url",
      "invalid-number",
      "invalid-slug",
      "invalid-category",
      "invalid-text",
      "rate-limited",
      "verification-failed",
      "submit-failed",
    ]) {
      const message = BRAND_APPLICATION_ERROR_MESSAGES[code];
      assert.ok(message, code);
      assert.doesNotMatch(message, /—/);
    }
  });
});

describe("brand apply Turnstile", () => {
  it("is a no-op unless both keys are set", async () => {
    assert.equal(isApplyTurnstileEnabled({}), false);
    assert.equal(isApplyTurnstileEnabled({ siteKey: "s" }), false);
    assert.equal(isApplyTurnstileEnabled({ secretKey: "k" }), false);
    const fetchImpl = (() => {
      throw new Error("should not be called");
    }) as unknown as typeof fetch;
    assert.equal(
      await verifyApplyTurnstile({ env: { siteKey: "s" }, token: null, fetchImpl }),
      true,
    );
  });

  it("fails closed when enabled and the token is missing or rejected", async () => {
    const env = { siteKey: "s", secretKey: "k" };
    assert.equal(await verifyApplyTurnstile({ env, token: null }), false);
    const rejected = (async () =>
      new Response(JSON.stringify({ success: false }), { status: 200 })) as typeof fetch;
    assert.equal(await verifyApplyTurnstile({ env, token: "t", fetchImpl: rejected }), false);
    const down = (async () => {
      throw new Error("network");
    }) as typeof fetch;
    assert.equal(await verifyApplyTurnstile({ env, token: "t", fetchImpl: down }), false);
    const accepted = (async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 })) as typeof fetch;
    assert.equal(await verifyApplyTurnstile({ env, token: "t", fetchImpl: accepted }), true);
  });
});

describe("brand apply action wiring", () => {
  it("rate limits, verifies, validates, then inserts the parsed row", () => {
    const src = readRepo("../app/for-brands/apply/actions.ts");
    const rate = src.indexOf("brandApplyRateLimiter.check");
    const turnstile = src.indexOf("verifyApplyTurnstile(");
    const parse = src.indexOf("parseBrandApplication(formData)");
    const insert = src.indexOf('.insert(parsed.row)');
    assert.ok(rate > 0 && turnstile > rate && parse > turnstile && insert > parse);
  });
});
