import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PASSWORD_SIGNUP_BOUNCE,
  continueAfterPasswordSignup,
} from "./password-signup-continue.ts";

const signupClient = readFileSync(
  fileURLToPath(new URL("../app/signup/signup-client.tsx", import.meta.url)),
  "utf8",
);

describe("password-first signup continue", () => {
  it("continues when signUp already returned a session", async () => {
    let signedIn = false;
    const result = await continueAfterPasswordSignup({
      session: { access_token: "tok" },
      email: "a@b.co",
      password: "password1",
      signInWithPassword: async () => {
        signedIn = true;
        return { data: { session: null }, error: null };
      },
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(signedIn, false);
  });

  it("signs in with the password just set when signUp has no session", async () => {
    const result = await continueAfterPasswordSignup({
      session: null,
      email: "a@b.co",
      password: "password1",
      signInWithPassword: async (creds) => {
        assert.equal(creds.email, "a@b.co");
        assert.equal(creds.password, "password1");
        return { data: { session: { access_token: "tok" } }, error: null };
      },
    });
    assert.deepEqual(result, { ok: true });
  });

  it("bounces only with the password-created line when sign-in still fails", async () => {
    const result = await continueAfterPasswordSignup({
      session: null,
      email: "a@b.co",
      password: "password1",
      signInWithPassword: async () => ({
        data: { session: null },
        error: { message: "Email not confirmed" },
      }),
    });
    assert.deepEqual(result, {
      ok: false,
      message: "Sign in with the password you just created",
    });
    assert.equal(result.message, PASSWORD_SIGNUP_BOUNCE);
  });

  it("signup success path does not instruct clicking a confirmation email", () => {
    assert.match(signupClient, /continueAfterPasswordSignup/);
    assert.match(signupClient, /signInWithPassword/);
    assert.doesNotMatch(signupClient, /Check your email/);
    assert.doesNotMatch(signupClient, /confirmation link/);
    assert.doesNotMatch(signupClient, /status === "confirm"/);
    assert.doesNotMatch(signupClient, /Resend confirmation/);
  });
});
