import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CHECKIN_TOKEN_EXPIRED_CODE,
  CHECKIN_TOKEN_PARAM,
  EXPIRED_LOOKBACK_BUCKETS,
  ROTATION_SECONDS,
  checkinPath,
  checkinRotationEnabled,
  checkinSecretFromEnv,
  checkinTokenBucket,
  checkinTokenDecision,
  checkinTokenExpiresAt,
  isExpiredCheckinToken,
  signCheckinToken,
  verifyCheckinToken,
} from "./checkin-token.ts";

const SECRET = "test-secret-for-unit-tests";
const ON = {}; // rotation enabled (default)
const OFF = { CHECKIN_TOKEN_ROTATION: "off" };

// A fixed instant well inside a bucket so +/- a few seconds stays put.
const BUCKET_MS = ROTATION_SECONDS * 1000;
const NOW = 1_800_000_000_000 - (1_800_000_000_000 % BUCKET_MS) + 300_000; // 5 min in

describe("rotation constants", () => {
  it("rotates every 15 minutes and recognises a day of stale codes", () => {
    assert.equal(ROTATION_SECONDS, 900);
    assert.equal(EXPIRED_LOOKBACK_BUCKETS, 96);
    assert.equal(CHECKIN_TOKEN_EXPIRED_CODE, "expired_code");
  });

  it("buckets by floor(unixSeconds / ROTATION_SECONDS)", () => {
    assert.equal(checkinTokenBucket(0), 0);
    assert.equal(checkinTokenBucket(BUCKET_MS - 1), 0);
    assert.equal(checkinTokenBucket(BUCKET_MS), 1);
    assert.equal(checkinTokenBucket(NOW), Math.floor(NOW / BUCKET_MS));
  });

  it("checkinTokenExpiresAt is the end of the current bucket", () => {
    const expires = checkinTokenExpiresAt(NOW);
    assert.equal(expires % BUCKET_MS, 0);
    assert.ok(expires > NOW);
    assert.ok(expires - NOW <= BUCKET_MS);
    assert.equal(checkinTokenBucket(expires), checkinTokenBucket(NOW) + 1);
  });
});

describe("checkinRotationEnabled", () => {
  it("is on by default and for any value other than off", () => {
    assert.equal(checkinRotationEnabled({}), true);
    assert.equal(checkinRotationEnabled({ CHECKIN_TOKEN_ROTATION: "on" }), true);
    assert.equal(checkinRotationEnabled({ CHECKIN_TOKEN_ROTATION: "false" }), true);
  });

  it("is off only for CHECKIN_TOKEN_ROTATION=off", () => {
    assert.equal(checkinRotationEnabled(OFF), false);
    assert.equal(checkinRotationEnabled({ CHECKIN_TOKEN_ROTATION: " OFF " }), false);
  });
});

describe("signCheckinToken / verifyCheckinToken (rotating)", () => {
  it("accepts a token signed for the same brand in the same bucket", () => {
    const token = signCheckinToken("nellies", SECRET, NOW, ON);
    assert.equal(verifyCheckinToken("nellies", token, SECRET, NOW, ON), true);
  });

  it("is stable within a bucket and url safe", () => {
    const a = signCheckinToken("nellies", SECRET, NOW, ON);
    assert.equal(a, signCheckinToken("nellies", SECRET, NOW + 60_000, ON));
    assert.match(a, /^[A-Za-z0-9_-]+$/);
  });

  it("rotates across buckets", () => {
    const a = signCheckinToken("nellies", SECRET, NOW, ON);
    const b = signCheckinToken("nellies", SECRET, NOW + BUCKET_MS, ON);
    const c = signCheckinToken("nellies", SECRET, NOW + 2 * BUCKET_MS, ON);
    assert.notEqual(a, b);
    assert.notEqual(b, c);
    assert.notEqual(a, c);
  });

  it("accepts the previous bucket (grace window)", () => {
    const token = signCheckinToken("nellies", SECRET, NOW, ON);
    assert.equal(
      verifyCheckinToken("nellies", token, SECRET, NOW + BUCKET_MS, ON),
      true,
    );
  });

  it("rejects two buckets back and tokens from the future", () => {
    const token = signCheckinToken("nellies", SECRET, NOW, ON);
    assert.equal(
      verifyCheckinToken("nellies", token, SECRET, NOW + 2 * BUCKET_MS, ON),
      false,
    );
    assert.equal(
      verifyCheckinToken("nellies", token, SECRET, NOW - BUCKET_MS, ON),
      false,
    );
  });

  it("differs from the legacy static token", () => {
    assert.notEqual(
      signCheckinToken("nellies", SECRET, NOW, ON),
      signCheckinToken("nellies", SECRET, NOW, OFF),
    );
    const legacy = signCheckinToken("nellies", SECRET, NOW, OFF);
    assert.equal(verifyCheckinToken("nellies", legacy, SECRET, NOW, ON), false);
  });

  it("ignores slug case and surrounding spaces", () => {
    const token = signCheckinToken("Nellies ", SECRET, NOW, ON);
    assert.equal(verifyCheckinToken("nellies", token, SECRET, NOW, ON), true);
  });

  it("rejects a token made for another brand", () => {
    const token = signCheckinToken("jonas-group-ent", SECRET, NOW, ON);
    assert.equal(verifyCheckinToken("nellies", token, SECRET, NOW, ON), false);
  });

  it("rejects a token made with another secret", () => {
    const token = signCheckinToken("nellies", "other-secret", NOW, ON);
    assert.equal(verifyCheckinToken("nellies", token, SECRET, NOW, ON), false);
  });

  it("rejects empty, short, long and tampered tokens", () => {
    const token = signCheckinToken("nellies", SECRET, NOW, ON);
    for (const bad of [
      "",
      null,
      undefined,
      "abc",
      `${token}x`,
      token.slice(0, -1),
      `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`,
    ]) {
      assert.equal(
        verifyCheckinToken("nellies", bad, SECRET, NOW, ON),
        false,
        String(bad),
      );
    }
  });
});

describe("legacy mode (CHECKIN_TOKEN_ROTATION=off)", () => {
  it("signs the static token regardless of time", () => {
    const a = signCheckinToken("nellies", SECRET, NOW, OFF);
    const b = signCheckinToken("nellies", SECRET, NOW + 1000 * BUCKET_MS, OFF);
    assert.equal(a, b);
  });

  it("verifies the static token forever and never reports expiry", () => {
    const token = signCheckinToken("nellies", SECRET, 0, OFF);
    assert.equal(
      verifyCheckinToken("nellies", token, SECRET, NOW + 500 * BUCKET_MS, OFF),
      true,
    );
    assert.equal(isExpiredCheckinToken("nellies", token, SECRET, NOW, OFF), false);
  });

  it("does not accept a rotating token", () => {
    const token = signCheckinToken("nellies", SECRET, NOW, ON);
    assert.equal(verifyCheckinToken("nellies", token, SECRET, NOW, OFF), false);
  });
});

describe("isExpiredCheckinToken", () => {
  it("is false for a current or grace-window token", () => {
    const token = signCheckinToken("nellies", SECRET, NOW, ON);
    assert.equal(isExpiredCheckinToken("nellies", token, SECRET, NOW, ON), false);
    assert.equal(
      isExpiredCheckinToken("nellies", token, SECRET, NOW + BUCKET_MS, ON),
      false,
    );
  });

  it("is true from two buckets back up to the lookback limit", () => {
    const token = signCheckinToken("nellies", SECRET, NOW, ON);
    assert.equal(
      isExpiredCheckinToken("nellies", token, SECRET, NOW + 2 * BUCKET_MS, ON),
      true,
    );
    assert.equal(
      isExpiredCheckinToken(
        "nellies",
        token,
        SECRET,
        NOW + EXPIRED_LOOKBACK_BUCKETS * BUCKET_MS,
        ON,
      ),
      true,
    );
    assert.equal(
      isExpiredCheckinToken(
        "nellies",
        token,
        SECRET,
        NOW + (EXPIRED_LOOKBACK_BUCKETS + 1) * BUCKET_MS,
        ON,
      ),
      false,
    );
  });

  it("is false for garbage and other brands", () => {
    assert.equal(isExpiredCheckinToken("nellies", "wrong", SECRET, NOW, ON), false);
    const other = signCheckinToken("jonas-group-ent", SECRET, NOW, ON);
    assert.equal(
      isExpiredCheckinToken("nellies", other, SECRET, NOW + 3 * BUCKET_MS, ON),
      false,
    );
  });
});

describe("constant-time compare", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./checkin-token.ts", import.meta.url)),
    "utf8",
  );

  it("still compares tokens with timingSafeEqual and never with ===", () => {
    assert.match(source, /timingSafeEqual\(/);
    assert.doesNotMatch(source, /given\s*===\s*expected/);
    assert.doesNotMatch(source, /token\s*===\s*sign/);
  });

  it("checks both grace buckets rather than short-circuiting on the first", () => {
    assert.match(source, /const current = tokenEquals\([\s\S]*const previous = tokenEquals\(/);
  });
});

describe("checkinTokenDecision", () => {
  it("allows everything while the secret is not configured", () => {
    assert.deepEqual(checkinTokenDecision("nellies", null, null, NOW, ON), {
      allow: true,
      reason: "unconfigured",
    });
    assert.deepEqual(checkinTokenDecision("nellies", "junk", null, NOW, ON), {
      allow: true,
      reason: "unconfigured",
    });
  });

  it("denies a missing token once the secret is set", () => {
    assert.deepEqual(checkinTokenDecision("nellies", null, SECRET, NOW, ON), {
      allow: false,
      reason: "missing",
    });
    assert.deepEqual(checkinTokenDecision("nellies", "", SECRET, NOW, ON), {
      allow: false,
      reason: "missing",
    });
  });

  it("denies a wrong token once the secret is set", () => {
    assert.deepEqual(checkinTokenDecision("nellies", "wrong", SECRET, NOW, ON), {
      allow: false,
      reason: "invalid",
    });
  });

  it("allows a valid token, including one from the previous bucket", () => {
    const token = signCheckinToken("nellies", SECRET, NOW, ON);
    assert.deepEqual(checkinTokenDecision("nellies", token, SECRET, NOW, ON), {
      allow: true,
      reason: "valid",
    });
    assert.deepEqual(
      checkinTokenDecision("nellies", token, SECRET, NOW + BUCKET_MS, ON),
      { allow: true, reason: "valid" },
    );
  });

  it("reports a rotated-out token as expired", () => {
    const token = signCheckinToken("nellies", SECRET, NOW, ON);
    assert.deepEqual(
      checkinTokenDecision("nellies", token, SECRET, NOW + 2 * BUCKET_MS, ON),
      { allow: false, reason: "expired" },
    );
  });

  it("in legacy mode a static token stays valid and nothing expires", () => {
    const token = signCheckinToken("nellies", SECRET, 0, OFF);
    assert.deepEqual(
      checkinTokenDecision("nellies", token, SECRET, NOW + 90 * BUCKET_MS, OFF),
      { allow: true, reason: "valid" },
    );
    assert.deepEqual(checkinTokenDecision("nellies", "wrong", SECRET, NOW, OFF), {
      allow: false,
      reason: "invalid",
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
    const token = signCheckinToken("nellies", SECRET, NOW, ON);
    assert.equal(
      checkinPath("nellies", token),
      `/brands/nellies/checkin?${CHECKIN_TOKEN_PARAM}=${token}`,
    );
  });
});
