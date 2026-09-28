import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WELCOME_SMS_BODY, isE164Phone, welcomeSmsTarget } from "./welcome-sms.ts";

const route = readFileSync(
  fileURLToPath(new URL("../app/api/member-engage/sms/route.ts", import.meta.url)),
  "utf8",
);

const consented = {
  phone: "+16155550123",
  sms_opted_in: true,
  consent_accepted_at: "2026-09-27T15:00:00.000Z",
  suspended: false,
};

describe("welcome SMS", () => {
  it("texts the stored phone of a member who ticked the box", () => {
    assert.deepEqual(welcomeSmsTarget(consented), { ok: true, to: "+16155550123" });
  });

  it("accepts a formatted stored phone and sends plain E.164", () => {
    const result = welcomeSmsTarget({ ...consented, phone: "+1 (615) 555-0123" });
    assert.deepEqual(result, { ok: true, to: "+16155550123" });
  });

  it("refuses members who did not opt in or have no consent time", () => {
    assert.equal(welcomeSmsTarget({ ...consented, sms_opted_in: false }).ok, false);
    assert.equal(welcomeSmsTarget({ ...consented, consent_accepted_at: null }).ok, false);
    assert.equal(welcomeSmsTarget(null).ok, false);
    assert.equal(welcomeSmsTarget({ ...consented, suspended: true }).ok, false);
  });

  it("refuses a missing or invalid stored phone", () => {
    assert.equal(welcomeSmsTarget({ ...consented, phone: null }).ok, false);
    assert.equal(welcomeSmsTarget({ ...consented, phone: "615-555-0123" }).ok, false);
    assert.equal(isE164Phone("+16155550123"), true);
    assert.equal(isE164Phone("+0123"), false);
  });

  it("uses fixed wording with opt-out language and no fan copy", () => {
    assert.match(WELCOME_SMS_BODY, /STOP to opt out/);
    assert.match(WELCOME_SMS_BODY, /HELP/);
    assert.doesNotMatch(WELCOME_SMS_BODY, /—|drop|brand,/i);
  });

  it("route ignores the request body and rate limits per member", () => {
    assert.doesNotMatch(route, /request\.json\(\)/);
    assert.match(route, /welcomeSmsRateLimiter\.check/);
    assert.match(route, /\.eq\("id", user\.id\)/);
    assert.match(route, /body: WELCOME_SMS_BODY/);
    assert.match(route, /to: target\.to/);
  });
});
