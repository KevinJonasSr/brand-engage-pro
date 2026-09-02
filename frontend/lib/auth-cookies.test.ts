import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  authCookieExpireDomains,
  collectAuthCookieNames,
  expireAuthCookieHeader,
  expireAuthCookiesOnResponse,
  isAuthCookieName,
  isAuthSignOutPath,
  supabaseAuthCookieBaseName,
} from "./auth-cookies.ts";

const proxySrc = readFileSync(
  fileURLToPath(new URL("../proxy.ts", import.meta.url)),
  "utf8",
);
const serverSrc = readFileSync(
  fileURLToPath(new URL("./supabase/server.ts", import.meta.url)),
  "utf8",
);
const clientSrc = readFileSync(
  fileURLToPath(new URL("./supabase/client.ts", import.meta.url)),
  "utf8",
);

describe("auth cookie isolation", () => {
  it("recognizes chunked and verifier sb-* names", () => {
    assert.equal(isAuthCookieName("sb-enfpviapxvqyoarwwsuf-auth-token"), true);
    assert.equal(isAuthCookieName("sb-enfpviapxvqyoarwwsuf-auth-token.0"), true);
    assert.equal(isAuthCookieName("sb-enfpviapxvqyoarwwsuf-auth-token.1"), true);
    assert.equal(
      isAuthCookieName("sb-enfpviapxvqyoarwwsuf-auth-token-code-verifier"),
      true,
    );
    assert.equal(isAuthCookieName("memberengage_ref"), false);
    assert.equal(isAuthCookieName("cookie_consent"), false);
  });

  it("expires host-only and parent-domain variants for www", () => {
    assert.deepEqual(authCookieExpireDomains("www.brandengagepro.com"), [
      undefined,
      "brandengagepro.com",
      ".brandengagepro.com",
    ]);
    const header = expireAuthCookieHeader(
      "sb-enfpviapxvqyoarwwsuf-auth-token",
      ".brandengagepro.com",
      true,
    );
    assert.match(header, /Max-Age=0/);
    assert.match(header, /Domain=\.brandengagepro.com/);
    assert.match(header, /Secure/);
    assert.match(header, /Path=\//);
  });

  it("appends one Set-Cookie per name/domain so leftovers cannot resurrect", () => {
    const appended: string[] = [];
    expireAuthCookiesOnResponse(
      { headers: { append: (_name, value) => appended.push(value) } },
      ["sb-enfpviapxvqyoarwwsuf-auth-token.0"],
      "www.brandengagepro.com",
    );
    assert.ok(appended.length >= 3);
    assert.ok(
      appended.some((row) =>
        row.includes("sb-enfpviapxvqyoarwwsuf-auth-token.0") &&
        !row.includes("Domain="),
      ),
    );
    assert.ok(
      appended.some((row) =>
        row.includes("sb-enfpviapxvqyoarwwsuf-auth-token.0") &&
        row.includes("Domain=.brandengagepro.com"),
      ),
    );
  });

  it("skips session refresh on sign-out doors and pins host-only cookies", () => {
    assert.equal(isAuthSignOutPath("/logout"), true);
    assert.equal(isAuthSignOutPath("/signout"), true);
    assert.equal(isAuthSignOutPath("/auth/signout"), true);
    assert.equal(isAuthSignOutPath("/"), false);
    assert.match(proxySrc, /isAuthSignOutPath/);
    assert.match(proxySrc, /domain: undefined/);
    assert.match(serverSrc, /AUTH_COOKIE_OPTIONS/);
    assert.match(clientSrc, /isSingleton: true/);
    const prior = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://enfpviapxvqyoarwwsuf.supabase.co";
    try {
      assert.equal(
        supabaseAuthCookieBaseName(),
        "sb-enfpviapxvqyoarwwsuf-auth-token",
      );
      assert.ok(
        collectAuthCookieNames([]).includes(
          "sb-enfpviapxvqyoarwwsuf-auth-token.1",
        ),
      );
    } finally {
      if (prior === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prior;
    }
  });
});
