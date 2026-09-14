import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SIGNUP_CREATE_FAILED_MESSAGE,
  SIGNUP_EMAIL_IN_USE_MESSAGE,
  SIGNUP_NOT_CREATED_MESSAGE,
  didSignupCreateUser,
  interpretSignupCreate,
  sanitizeSignupError,
} from "./signup-outcome.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("didSignupCreateUser", () => {
  it("treats missing user as a non-create", () => {
    assert.equal(didSignupCreateUser(null), false);
    assert.equal(didSignupCreateUser(undefined), false);
  });

  it("treats empty identities as a silent non-create", () => {
    assert.equal(didSignupCreateUser({ identities: [] }), false);
  });

  it("treats a user with an identity as created", () => {
    assert.equal(didSignupCreateUser({ identities: [{ id: "1" }] }), true);
  });
});

describe("sanitizeSignupError", () => {
  it("maps GoTrue database-save failures to friendly copy", () => {
    assert.equal(
      sanitizeSignupError("Database error saving new user"),
      SIGNUP_CREATE_FAILED_MESSAGE,
    );
    assert.equal(
      sanitizeSignupError('duplicate key value violates unique constraint "members_email_key"'),
      SIGNUP_CREATE_FAILED_MESSAGE,
    );
    assert.equal(
      sanitizeSignupError("500: Database error saving new user"),
      SIGNUP_CREATE_FAILED_MESSAGE,
    );
  });

  it("maps already-registered to email-in-use copy", () => {
    assert.equal(sanitizeSignupError("User already registered"), SIGNUP_EMAIL_IN_USE_MESSAGE);
    assert.equal(
      sanitizeSignupError("A user with this email address has already been registered"),
      SIGNUP_EMAIL_IN_USE_MESSAGE,
    );
    assert.equal(
      sanitizeSignupError("Email address is already in use"),
      SIGNUP_EMAIL_IN_USE_MESSAGE,
    );
  });

  it("never returns raw postgres, GoTrue, or Turnstile blame for duplicates", () => {
    for (const raw of [
      "User already registered",
      "Database error saving new user",
      "SQLSTATE 23505",
      "permission denied for table members",
      "new row violates row-level security policy",
    ]) {
      const msg = sanitizeSignupError(raw);
      assert.doesNotMatch(msg, /database error|sqlstate|violates|permission denied/i);
      assert.doesNotMatch(msg, /already registered/i);
      assert.doesNotMatch(msg, /Turnstile|security check/i);
    }
  });
});

describe("interpretSignupCreate", () => {
  it("stays on signup with friendly copy when signUp fails", () => {
    const result = interpretSignupCreate({
      signUpError: "User already registered",
      user: null,
      session: null,
      signInError: null,
      signInSession: null,
    });
    assert.equal(result.action, "stay-error");
    assert.equal(result.message, SIGNUP_EMAIL_IN_USE_MESSAGE);
    assert.doesNotMatch(result.message, /already registered/i);
    assert.doesNotMatch(result.message, /Turnstile|security check/i);
  });

  it("does not surface Database error saving new user", () => {
    const result = interpretSignupCreate({
      signUpError: "Database error saving new user",
      user: null,
      session: null,
      signInError: null,
      signInSession: null,
    });
    assert.equal(result.action, "stay-error");
    assert.equal(result.message, SIGNUP_CREATE_FAILED_MESSAGE);
    assert.doesNotMatch(result.message, /Database error saving new user/);
  });

  it("maps silent empty-identities (duplicate email) to in-use copy", () => {
    const result = interpretSignupCreate({
      signUpError: null,
      user: { identities: [] },
      session: null,
      signInError: "Invalid login credentials",
      signInSession: null,
    });
    assert.equal(result.action, "stay-error");
    assert.equal(result.message, SIGNUP_EMAIL_IN_USE_MESSAGE);
    assert.doesNotMatch(result.message, /password you just created/i);
    assert.doesNotMatch(result.message, /Turnstile|security check/i);
  });

  it("stays on signup when create looked ok but password sign-in failed", () => {
    const result = interpretSignupCreate({
      signUpError: null,
      user: { identities: [{ id: "1" }] },
      session: null,
      signInError: "Invalid login credentials",
      signInSession: null,
    });
    assert.equal(result.action, "stay-error");
    assert.equal(result.message, SIGNUP_NOT_CREATED_MESSAGE);
    assert.doesNotMatch(result.message, /password you just created/i);
  });

  it("proceeds only when a session exists", () => {
    assert.equal(
      interpretSignupCreate({
        signUpError: null,
        user: { identities: [{ id: "1" }] },
        session: { access_token: "t" },
        signInError: null,
        signInSession: null,
      }).action,
      "proceed",
    );
    assert.equal(
      interpretSignupCreate({
        signUpError: null,
        user: { identities: [{ id: "1" }] },
        session: null,
        signInError: null,
        signInSession: { access_token: "t" },
      }).action,
      "proceed",
    );
  });
});

describe("signup form stays on /signup after a failed create", () => {
  it("uses interpretSignupCreate and sanitizes thrown errors", () => {
    const signup = readRepo("../app/signup/signup-client.tsx");
    assert.match(signup, /interpretSignupCreate/);
    assert.match(signup, /sanitizeSignupError/);
    assert.match(signup, /SIGNUP_EMAIL_IN_USE_MESSAGE|interpretSignupCreate/);
    const createAt = signup.indexOf("async function createAccount");
    const createFn = signup.slice(createAt, createAt + 2800);
    assert.match(createFn, /sanitizeSignupError/);
    assert.doesNotMatch(createFn, /setMessage\(err instanceof Error \? err\.message/);
  });
});
