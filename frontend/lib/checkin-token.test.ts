import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHECKIN_TOKEN_PARAM,
  ROTATING_CHECKIN_PREFIX,
  checkinAccessDecision,
  checkinBucket,
  checkinPath,
  checkinSecretFromEnv,
  checkinTokenDecision,
  checkinWindowSeconds,
  rotatingRefreshInMs,
  signCheckinToken,
  signRotatingCheckinToken,
  verifyCheckinToken,
  verifyRotatingCheckinToken,
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

describe("rotating check-in tokens", () => {
  const windowSeconds = 600;
  const now = Date.UTC(2026, 9, 11, 16, 7, 30);

  it("uses a version prefix the static poster token never has", () => {
    const poster = signCheckinToken("nellies", SECRET);
    const rotating = signRotatingCheckinToken("nellies", SECRET, 1);
    assert.equal(poster.includes("."), false);
    assert.equal(rotating.startsWith(ROTATING_CHECKIN_PREFIX), true);
    assert.equal(verifyCheckinToken("nellies", rotating, SECRET), false);
    assert.equal(verifyCheckinToken("nellies", poster, SECRET), true);
  });

  it("accepts the current bucket through the boundary and the previous bucket after it", () => {
    const bucket = checkinBucket(now, windowSeconds);
    const token = signRotatingCheckinToken("nellies", SECRET, bucket);
    const bucketEnd = (bucket + 1) * windowSeconds * 1000;

    assert.equal(
      verifyRotatingCheckinToken("nellies", token, SECRET, now, windowSeconds),
      "current",
    );
    assert.equal(
      verifyRotatingCheckinToken("nellies", token, SECRET, bucketEnd - 1, windowSeconds),
      "current",
    );
    assert.equal(
      verifyRotatingCheckinToken("nellies", token, SECRET, bucketEnd, windowSeconds),
      "previous",
    );
    assert.equal(
      verifyRotatingCheckinToken(
        "nellies",
        token,
        SECRET,
        bucketEnd + windowSeconds * 1000 - 1,
        windowSeconds,
      ),
      "previous",
    );
  });

  it("rejects a token from two buckets ago and a token from the next bucket", () => {
    const bucket = checkinBucket(now, windowSeconds);
    const token = signRotatingCheckinToken("nellies", SECRET, bucket);
    const twoLater = (bucket + 2) * windowSeconds * 1000;
    assert.equal(
      verifyRotatingCheckinToken("nellies", token, SECRET, twoLater, windowSeconds),
      null,
    );
    const future = signRotatingCheckinToken("nellies", SECRET, bucket + 1);
    assert.equal(
      verifyRotatingCheckinToken("nellies", future, SECRET, now, windowSeconds),
      null,
    );
  });

  it("rejects another brand, another secret, and a truncated rotating token", () => {
    const bucket = checkinBucket(now, windowSeconds);
    const token = signRotatingCheckinToken("nellies", SECRET, bucket);
    assert.equal(
      verifyRotatingCheckinToken("jonas-group-ent", token, SECRET, now, windowSeconds),
      null,
    );
    assert.equal(
      verifyRotatingCheckinToken("nellies", token, "other-secret", now, windowSeconds),
      null,
    );
    assert.equal(
      verifyRotatingCheckinToken("nellies", token.slice(0, -1), SECRET, now, windowSeconds),
      null,
    );
    assert.equal(
      verifyRotatingCheckinToken("nellies", `${token}x`, SECRET, now, windowSeconds),
      null,
    );
  });

  it("clamps the window and defaults to 10 minutes", () => {
    assert.equal(checkinWindowSeconds({}), 600);
    assert.equal(checkinWindowSeconds({ CHECKIN_ROTATING_WINDOW_SECONDS: "10" }), 60);
    assert.equal(checkinWindowSeconds({ CHECKIN_ROTATING_WINDOW_SECONDS: "999999" }), 86_400);
    assert.equal(checkinWindowSeconds({ CHECKIN_ROTATING_WINDOW_SECONDS: "nope" }), 600);
    assert.equal(rotatingRefreshInMs(0, 600), 600_000);
    assert.equal(rotatingRefreshInMs(599_500, 600), 1000);
  });
});

describe("checkinAccessDecision", () => {
  const windowSeconds = 600;
  const now = Date.UTC(2026, 9, 11, 16, 7, 30);
  const bucket = checkinBucket(now, windowSeconds);

  it("awards points for the static poster token when rotating check-in is off", () => {
    const poster = signCheckinToken("nellies", SECRET);
    assert.deepEqual(
      checkinAccessDecision("nellies", poster, SECRET, false, now, windowSeconds),
      { allow: true, awardPoints: true, reason: "valid" },
    );
    const rotating = signRotatingCheckinToken("nellies", SECRET, bucket);
    assert.deepEqual(
      checkinAccessDecision("nellies", rotating, SECRET, false, now, windowSeconds),
      { allow: false, awardPoints: false, reason: "invalid" },
    );
  });

  it("keeps the poster as sign-up only and awards the current and previous rotating codes", () => {
    const poster = signCheckinToken("nellies", SECRET);
    assert.deepEqual(
      checkinAccessDecision("nellies", poster, SECRET, true, now, windowSeconds),
      { allow: true, awardPoints: false, reason: "static_signup_only" },
    );
    const current = signRotatingCheckinToken("nellies", SECRET, bucket);
    assert.deepEqual(
      checkinAccessDecision("nellies", current, SECRET, true, now, windowSeconds),
      { allow: true, awardPoints: true, reason: "rotating" },
    );
    const previous = signRotatingCheckinToken("nellies", SECRET, bucket - 1);
    assert.deepEqual(
      checkinAccessDecision("nellies", previous, SECRET, true, now, windowSeconds),
      { allow: true, awardPoints: true, reason: "rotating_previous" },
    );
  });

  it("rejects an expired rotating token when the brand requires one", () => {
    const expired = signRotatingCheckinToken("nellies", SECRET, bucket - 2);
    assert.deepEqual(
      checkinAccessDecision("nellies", expired, SECRET, true, now, windowSeconds),
      { allow: false, awardPoints: false, reason: "expired" },
    );
  });

  it("still allows check-ins when the signing secret is unset, in both modes", () => {
    assert.deepEqual(checkinAccessDecision("nellies", null, null, false), {
      allow: true,
      awardPoints: true,
      reason: "unconfigured",
    });
    assert.deepEqual(checkinAccessDecision("nellies", null, null, true), {
      allow: true,
      awardPoints: true,
      reason: "unconfigured",
    });
  });

  it("denies a missing token once the secret is set, in both modes", () => {
    assert.deepEqual(checkinAccessDecision("nellies", null, SECRET, false), {
      allow: false,
      awardPoints: false,
      reason: "missing",
    });
    assert.deepEqual(checkinAccessDecision("nellies", "", SECRET, true), {
      allow: false,
      awardPoints: false,
      reason: "missing",
    });
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
