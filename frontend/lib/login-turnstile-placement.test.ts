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

describe("login Turnstile placement", () => {
  it("does not mount Turnstile inside the password form", () => {
    assert.match(passwordForm, /handlePassword/);
    assert.doesNotMatch(passwordForm, /TurnstileWidget/);
  });

  it("keeps the magic-link CTA as type=button outside the password form", () => {
    assert.match(loginPage, /type="button"/);
    assert.match(loginPage, /void handleMagicLink/);
    const buttonIdx = loginPage.indexOf("void handleMagicLink");
    assert.ok(buttonIdx > passwordFormEnd, "magic-link button must sit after the password form");
  });

  it("defers the widget until magic-link is open and email is present", () => {
    assert.match(loginPage, /magicLinkOpen && emailReadyForMagicLink\(email\)/);
    assert.match(loginPage, /pendingMagicSend/);
  });
});
