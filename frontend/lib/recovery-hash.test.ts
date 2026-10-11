import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRecoveryHash, recoveryRedirectTarget } from "./recovery-hash.ts";

const GOOD = "#access_token=aaa&expires_in=3600&refresh_token=rrr&token_type=bearer&type=recovery";

describe("parseRecoveryHash", () => {
  it("reads tokens from a recovery hash", () => {
    assert.deepEqual(parseRecoveryHash(GOOD), {
      kind: "tokens",
      accessToken: "aaa",
      refreshToken: "rrr",
    });
  });

  it("works without the leading #", () => {
    assert.equal(parseRecoveryHash(GOOD.slice(1))?.kind, "tokens");
  });

  it("ignores hashes that are not recovery", () => {
    assert.equal(parseRecoveryHash("#access_token=a&refresh_token=r&type=magiclink"), null);
    assert.equal(parseRecoveryHash("#section-2"), null);
    assert.equal(parseRecoveryHash(""), null);
  });

  it("ignores a recovery hash missing a token", () => {
    assert.equal(parseRecoveryHash("#access_token=a&type=recovery"), null);
  });

  it("reports an expired or used link", () => {
    assert.deepEqual(
      parseRecoveryHash("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"),
      { kind: "error", message: "Email link is invalid or has expired" },
    );
  });
});

describe("recoveryRedirectTarget", () => {
  it("sends a recovery hash on the home page to the reset page", () => {
    assert.equal(recoveryRedirectTarget("/", GOOD), "/reset-password" + GOOD);
  });

  it("stays put on the reset page", () => {
    assert.equal(recoveryRedirectTarget("/reset-password", GOOD), null);
  });

  it("stays put for other hashes", () => {
    assert.equal(recoveryRedirectTarget("/", "#faq"), null);
  });
});
