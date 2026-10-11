import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHECKIN_TOKEN_PARAM,
  checkinPath,
  checkinSecretFromEnv,
  checkinTokenDecision,
  signCheckinToken,
  verifyCheckinToken,
} from "./checkin-token.ts";

const SECRET = "test-secret-for-unit-tests";

describe("signCheckinToken / verifyCheckinToken", () => {
  it("accepts a token signed for the same brand", () => {
    const token = signCheckinToken("nellies", SECRET);
    assert.equal(verifyCheckinToken("nellies", token, SECRET), true);
  });

  it("is stable and url safe", () => {
    const a = signCheckinToken("nellies", SECRET);
    assert.equal(a, signCheckinToken("nellies", SECRET));
    assert.match(a, /^[A-Za-z0-9_-]+$/);
  });

  it("ignores slug case and surrounding spaces", () => {
    const token = signCheckinToken("Nellies ", SECRET);
    assert.equal(verifyCheckinToken("nellies", token, SECRET), true);
  });

  it("rejects a token made for another brand", () => {
    const token = signCheckinToken("jonas-group-ent", SECRET);
    assert.equal(verifyCheckinToken("nellies", token, SECRET), false);
  });

  it("rejects a token made with another secret", () => {
    const token = signCheckinToken("nellies", "other-secret");
    assert.equal(verifyCheckinToken("nellies", token, SECRET), false);
  });

  it("rejects empty, short, long and tampered tokens", () => {
    const token = signCheckinToken("nellies", SECRET);
    for (const bad of [
      "",
      null,
      undefined,
      "abc",
      `${token}x`,
      token.slice(0, -1),
      `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`,
    ]) {
      assert.equal(verifyCheckinToken("nellies", bad, SECRET), false, String(bad));
    }
  });
});

describe("checkinTokenDecision", () => {
  it("allows everything while the secret is not configured", () => {
    assert.deepEqual(checkinTokenDecision("nellies", null, null), {
      allow: true,
      reason: "unconfigured",
    });
    assert.deepEqual(checkinTokenDecision("nellies", "junk", null), {
      allow: true,
      reason: "unconfigured",
    });
  });

  it("denies a missing token once the secret is set", () => {
    assert.deepEqual(checkinTokenDecision("nellies", null, SECRET), {
      allow: false,
      reason: "missing",
    });
    assert.deepEqual(checkinTokenDecision("nellies", "", SECRET), {
      allow: false,
      reason: "missing",
    });
  });

  it("denies a wrong token once the secret is set", () => {
    assert.deepEqual(checkinTokenDecision("nellies", "wrong", SECRET), {
      allow: false,
      reason: "invalid",
    });
  });

  it("allows a valid token", () => {
    const token = signCheckinToken("nellies", SECRET);
    assert.deepEqual(checkinTokenDecision("nellies", token, SECRET), {
      allow: true,
      reason: "valid",
    });
  });
});

describe("checkinSecretFromEnv", () => {
  it("treats missing or blank as not configured", () => {
    assert.equal(checkinSecretFromEnv({}), null);
    assert.equal(checkinSecretFromEnv({ CHECKIN_SIGNING_SECRET: "   " }), null);
  });

  it("returns the trimmed secret when set", () => {
    assert.equal(checkinSecretFromEnv({ CHECKIN_SIGNING_SECRET: " abc " }), "abc");
  });
});

describe("checkinPath", () => {
  it("builds the plain path without a token", () => {
    assert.equal(checkinPath("nellies"), "/brands/nellies/checkin");
    assert.equal(checkinPath("nellies", null), "/brands/nellies/checkin");
  });

  it("adds the token as a query parameter", () => {
    const token = signCheckinToken("nellies", SECRET);
    assert.equal(
      checkinPath("nellies", token),
      `/brands/nellies/checkin?${CHECKIN_TOKEN_PARAM}=${token}`,
    );
  });
});
