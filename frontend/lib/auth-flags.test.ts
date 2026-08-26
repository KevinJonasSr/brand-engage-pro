import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isForgotPasswordEnabled, isMagicLinkEnabled } from "./auth-flags.ts";

const loginPage = readFileSync(
  fileURLToPath(new URL("../app/login/page.tsx", import.meta.url)),
  "utf8",
);
const loginClient = readFileSync(
  fileURLToPath(new URL("../app/login/login-client.tsx", import.meta.url)),
  "utf8",
);
const envExample = readFileSync(
  fileURLToPath(new URL("../.env.example", import.meta.url)),
  "utf8",
);

describe("auth door flags", () => {
  it("hides magic-link and forgot-password in production unless explicitly true", () => {
    assert.equal(
      isMagicLinkEnabled({ VERCEL_ENV: "production" }),
      false,
    );
    assert.equal(
      isForgotPasswordEnabled({ NEXT_PUBLIC_VERCEL_ENV: "production" }),
      false,
    );
    assert.equal(
      isMagicLinkEnabled({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_MAGIC_LINK_ENABLED: "true",
      }),
      true,
    );
    assert.equal(
      isForgotPasswordEnabled({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED: "true",
      }),
      true,
    );
    assert.equal(
      isMagicLinkEnabled({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_MAGIC_LINK_ENABLED: "false",
      }),
      false,
    );
  });

  it("keeps doors on for preview and local unless production", () => {
    assert.equal(isMagicLinkEnabled({ VERCEL_ENV: "preview" }), true);
    assert.equal(isForgotPasswordEnabled({}), true);
  });

  it("login page passes flags and production-off hides both CTAs", () => {
    assert.match(loginPage, /isMagicLinkEnabled\(\)/);
    assert.match(loginPage, /isForgotPasswordEnabled\(\)/);
    assert.match(loginPage, /magicLinkEnabled=/);
    assert.match(loginPage, /forgotPasswordEnabled=/);

    assert.match(loginClient, /magicLinkEnabled && \(/);
    assert.match(loginClient, /forgotPasswordEnabled && \(/);
    assert.match(loginClient, /magicLinkButtonLabel/);
    assert.match(loginClient, /Forgot password\?/);
  });

  it("documents flags in .env.example without enabling them in production", () => {
    assert.match(envExample, /NEXT_PUBLIC_MAGIC_LINK_ENABLED/);
    assert.match(envExample, /NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED/);
    assert.doesNotMatch(envExample, /^NEXT_PUBLIC_MAGIC_LINK_ENABLED=true/m);
    assert.doesNotMatch(envExample, /^NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED=true/m);
  });
});
