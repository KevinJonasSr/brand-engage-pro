import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bearerSecretMatches } from "./bearer-auth.ts";

describe("bearerSecretMatches", () => {
  const secret = "seed-secret-value";

  it("accepts the exact bearer secret", () => {
    assert.equal(bearerSecretMatches(`Bearer ${secret}`, secret), true);
  });

  it("rejects a missing secret so the route can return 401", () => {
    assert.equal(bearerSecretMatches(`Bearer ${secret}`, null), false);
    assert.equal(bearerSecretMatches(`Bearer ${secret}`, ""), false);
    assert.equal(bearerSecretMatches(`Bearer ${secret}`, undefined), false);
  });

  it("rejects a wrong secret, a missing header, and a length mismatch", () => {
    assert.equal(bearerSecretMatches("Bearer other-secret-value", secret), false);
    assert.equal(bearerSecretMatches(null, secret), false);
    assert.equal(bearerSecretMatches("", secret), false);
    assert.equal(bearerSecretMatches(`Bearer ${secret}x`, secret), false);
    assert.equal(bearerSecretMatches(secret, secret), false);
  });
});
