import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const loginPage = readFileSync(
  fileURLToPath(new URL("../app/login/login-client.tsx", import.meta.url)),
  "utf8",
);
const passwordFormStart = loginPage.indexOf("<form onSubmit={handlePassword}");
const passwordFormEnd = loginPage.indexOf("</form>", passwordFormStart);
const passwordForm = loginPage.slice(passwordFormStart, passwordFormEnd);
const passwordFn = loginPage.slice(
  loginPage.indexOf("async function handlePassword"),
  loginPage.indexOf("const magicGate"),
);

describe("login Turnstile placement", () => {
  it("mounts Turnstile inside the password form when configured", () => {
    assert.match(passwordForm, /handlePassword/);
    assert.match(passwordForm, /turnstileConfigured/);
    assert.match(passwordForm, /TurnstileWidget/);
  });

  it("binds captchaToken into signInWithPassword via buildPasswordAuthCredentials", () => {
    assert.match(passwordFn, /signInWithPassword/);
    assert.match(passwordFn, /buildPasswordAuthCredentials/);
    assert.match(passwordFn, /turnstileToken/);
    assert.doesNotMatch(
      passwordFn,
      /signInWithPassword\(\{\s*email,\s*password\s*\}\)/,
    );
  });

  it("keeps the magic-link CTA as type=button outside the password form", () => {
    assert.match(loginPage, /type="button"/);
    assert.match(loginPage, /void handleMagicLink/);
    const buttonIdx = loginPage.indexOf("void handleMagicLink");
    assert.ok(buttonIdx > passwordFormEnd, "magic-link button must sit after the password form");
  });

  it("does not mount a second widget on the magic-link path", () => {
    const afterForm = loginPage.slice(passwordFormEnd);
    assert.doesNotMatch(afterForm, /TurnstileWidget/);
    assert.match(loginPage, /reuses the same unconsumed challenge token/);
  });
});
