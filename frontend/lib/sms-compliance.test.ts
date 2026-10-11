import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HELP_REPLY,
  SMS_CONSENT_TEXT,
  START_REPLY,
  STOP_REPLY,
  isSmsQuietTime,
  parseSmsKeyword,
  phoneLookupVariants,
  withStopFooter,
} from "./sms-compliance.ts";

// 12:00 UTC is 7am in Chicago (CDT) and 8am in New York (EDT).
const NOW = new Date("2026-10-11T12:00:00.000Z");
const at = (iso: string) => new Date(iso);

describe("parseSmsKeyword", () => {
  it("reads stop words", () => {
    for (const w of ["STOP", "stop", "Stop.", "unsubscribe", "cancel", "END", "quit", "stopall"]) {
      assert.equal(parseSmsKeyword(w), "stop", w);
    }
  });

  it("reads start and help words", () => {
    assert.equal(parseSmsKeyword("start"), "start");
    assert.equal(parseSmsKeyword("YES please"), "start");
    assert.equal(parseSmsKeyword("unstop"), "start");
    assert.equal(parseSmsKeyword("help"), "help");
    assert.equal(parseSmsKeyword(" Info "), "help");
  });

  it("uses only the first word", () => {
    assert.equal(parseSmsKeyword("stop texting me"), "stop");
    assert.equal(parseSmsKeyword("please stop"), null);
  });

  it("ignores other text", () => {
    assert.equal(parseSmsKeyword("thanks!"), null);
    assert.equal(parseSmsKeyword(""), null);
    assert.equal(parseSmsKeyword(null), null);
    assert.equal(parseSmsKeyword("stopwatch"), null);
  });
});

describe("replies and consent text", () => {
  it("HELP names the program, frequency, rates, support and STOP", () => {
    assert.match(HELP_REPLY, /Brand Engage Pro/);
    assert.match(HELP_REPLY, /Msg frequency varies/);
    assert.match(HELP_REPLY, /Msg & data rates may apply/);
    assert.match(HELP_REPLY, /support@brandengagepro\.com/);
    assert.match(HELP_REPLY, /Reply STOP/);
  });

  it("STOP confirms no more messages and how to come back", () => {
    assert.match(STOP_REPLY, /no more messages/);
    assert.match(STOP_REPLY, /START/);
  });

  it("START repeats the disclosures", () => {
    assert.match(START_REPLY, /Msg frequency varies/);
    assert.match(START_REPLY, /Reply STOP/);
  });

  it("consent text carries every required disclosure", () => {
    assert.match(SMS_CONSENT_TEXT, /Msg frequency varies/);
    assert.match(SMS_CONSENT_TEXT, /Msg & data rates may apply/);
    assert.match(SMS_CONSENT_TEXT, /HELP/);
    assert.match(SMS_CONSENT_TEXT, /STOP/);
    assert.match(SMS_CONSENT_TEXT, /not a condition of purchase/);
  });

  it("replies fit in two SMS segments", () => {
    for (const r of [HELP_REPLY, STOP_REPLY, START_REPLY]) assert.ok(r.length <= 320, r);
  });
});

describe("withStopFooter", () => {
  it("adds the footer", () => {
    assert.equal(withStopFooter("Half off today."), "Half off today. Reply STOP to opt out.");
  });

  it("leaves a message that already says STOP", () => {
    assert.equal(withStopFooter("Text stop to quit"), "Text stop to quit");
  });

  it("is not fooled by STOP inside another word", () => {
    assert.match(withStopFooter("Stop by the bus stopover"), /Stop by/);
    assert.ok(withStopFooter("Visit our nonstop sale").endsWith("Reply STOP to opt out."));
  });
});

describe("phoneLookupVariants", () => {
  it("covers E.164 and bare digit forms for a US number", () => {
    const v = phoneLookupVariants("+15125551234");
    for (const want of ["+15125551234", "15125551234", "5125551234"]) assert.ok(v.includes(want), want);
  });

  it("handles a 10-digit number", () => {
    assert.ok(phoneLookupVariants("(512) 555-1234").includes("+15125551234"));
  });

  it("returns nothing for an empty number", () => {
    assert.deepEqual(phoneLookupVariants(""), []);
    assert.deepEqual(phoneLookupVariants(null), []);
  });
});

describe("isSmsQuietTime", () => {
  it("is quiet before 8am local", () => {
    assert.equal(isSmsQuietTime("America/Chicago", NOW), true); // 7am
  });

  it("opens at 8am local", () => {
    assert.equal(isSmsQuietTime("America/New_York", NOW), false); // 8am
  });

  it("is quiet from 9pm local", () => {
    assert.equal(isSmsQuietTime("America/Chicago", at("2026-10-12T01:59:00.000Z")), false); // 8:59pm
    assert.equal(isSmsQuietTime("America/Chicago", at("2026-10-12T02:00:00.000Z")), true); // 9pm
  });

  it("falls back to Chicago for a missing or bad zone", () => {
    assert.equal(isSmsQuietTime(null, NOW), true);
    assert.equal(isSmsQuietTime("Not/AZone", NOW), true);
    assert.equal(isSmsQuietTime("Not/AZone", at("2026-10-11T18:00:00.000Z")), false);
  });
});
