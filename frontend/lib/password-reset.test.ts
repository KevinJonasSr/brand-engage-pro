import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RESET_LINK_COOLDOWN_SECONDS,
  authCallbackErrorPath,
  authCallbackIncompleteMessage,
  authCallbackUserMessage,
  authEmailRedirectTo,
  buildResetPasswordEmailOptions,
  isPasswordRecoveryEntry,
  parseAuthCallbackSearch,
  resetLinkButtonLabel,
} from "./password-reset.ts";

describe("password reset callback", () => {
  it("sends a recovery code with no next to /reset-password", () => {
    const parsed = parseAuthCallbackSearch(
      new URLSearchParams("code=abc&type=recovery"),
    );
    assert.equal(parsed.code, "abc");
    assert.equal(parsed.type, "recovery");
    assert.equal(parsed.next, "/reset-password");
  });

  it("keeps an explicit safe next and drops off-site next", () => {
    assert.equal(
      parseAuthCallbackSearch(new URLSearchParams("code=abc&next=%2Frewards")).next,
      "/rewards",
    );
    assert.equal(
      parseAuthCallbackSearch(new URLSearchParams("code=abc&next=https://evil.test")).next,
      "/",
    );
  });

  it("routes reset errors to /forgot-password only while the door is open", () => {
    assert.equal(
      authCallbackErrorPath({
        message: "expired",
        next: "/reset-password",
        forgotPasswordEnabled: true,
      }),
      "/forgot-password?error=expired",
    );
    assert.equal(
      authCallbackErrorPath({
        message: "expired",
        next: "/reset-password",
        forgotPasswordEnabled: false,
      }),
      "/login?error=expired&next=%2Freset-password",
    );
    assert.match(
      authCallbackUserMessage("/reset-password"),
      /password reset link has expired/,
    );
    assert.match(
      authCallbackIncompleteMessage("/reset-password"),
      /password reset link is incomplete/,
    );
  });

  it("builds the email redirect and binds a Turnstile token when configured", () => {
    assert.equal(
      authEmailRedirectTo("/reset-password", "https://www.brandengagepro.com"),
      "https://www.brandengagepro.com/auth/callback?next=%2Freset-password",
    );
    assert.deepEqual(
      buildResetPasswordEmailOptions({
        redirectTo: "https://www.brandengagepro.com/auth/callback?next=%2Freset-password",
        turnstileConfigured: true,
        turnstileToken: " token ",
      }),
      {
        redirectTo: "https://www.brandengagepro.com/auth/callback?next=%2Freset-password",
        captchaToken: "token",
      },
    );
    assert.throws(
      () =>
        buildResetPasswordEmailOptions({
          redirectTo: "https://www.brandengagepro.com/auth/callback?next=%2Freset-password",
          turnstileConfigured: true,
          turnstileToken: " ",
        }),
      /security check/i,
    );
  });

  it("uses Fan Engage's resend cooldown and button labels", () => {
    assert.equal(RESET_LINK_COOLDOWN_SECONDS, 45);
    assert.equal(
      resetLinkButtonLabel({
        cooldown: 45,
        status: "sent",
        turnstileConfigured: true,
        loadState: "ready",
        hasToken: false,
      }),
      "Resend reset link in 45s",
    );
    assert.equal(
      resetLinkButtonLabel({
        cooldown: 0,
        status: "idle",
        turnstileConfigured: false,
        loadState: "ready",
        hasToken: false,
      }),
      "Send reset link",
    );
  });

  it("treats the reset page and recovery callback as session-preserving", () => {
    assert.equal(isPasswordRecoveryEntry("/reset-password"), true);
    assert.equal(
      isPasswordRecoveryEntry("/auth/callback", "?code=abc&next=%2Freset-password"),
      true,
    );
    assert.equal(isPasswordRecoveryEntry("/auth/callback", "?code=abc&next=%2Fonboarding"), false);
    assert.equal(isPasswordRecoveryEntry("/login"), false);
  });
});

describe("password reset stays behind the production flag", () => {
  const forgotPage = readFileSync(
    fileURLToPath(new URL("../app/forgot-password/page.tsx", import.meta.url)),
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

  it("still redirects /forgot-password to /login while HOLD and hides the login link", () => {
    assert.match(forgotPage, /isForgotPasswordEnabled\(\)/);
    assert.match(forgotPage, /redirect\("\/login"\)/);
    assert.match(loginClient, /forgotPasswordEnabled && \(/);
    assert.doesNotMatch(envExample, /^NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED=true/m);
  });
});
