import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseVerdictText } from "./index.ts";

describe("parseVerdictText", () => {
  it("reads a plain JSON verdict", () => {
    assert.deepEqual(
      parseVerdictText('{"verdict":"suspicious","confidence":0.876,"reasons":["burst of posts"]}'),
      { verdict: "suspicious", confidence: 0.88, reasons: ["burst of posts"] },
    );
  });

  it("reads a verdict inside code fences", () => {
    const r = parseVerdictText('```json\n{"verdict":"legitimate","confidence":0.9,"reasons":[]}\n```');
    assert.equal(r?.verdict, "legitimate");
  });

  it("rejects an unknown verdict instead of calling it legitimate", () => {
    assert.equal(parseVerdictText('{"verdict":"fraud","confidence":0.9}'), null);
    assert.equal(parseVerdictText('{"confidence":0.9}'), null);
  });

  it("rejects text that is not JSON", () => {
    assert.equal(parseVerdictText("I think this member is fine."), null);
    assert.equal(parseVerdictText(""), null);
    assert.equal(parseVerdictText("null"), null);
  });

  it("falls back to 0.5 for a bad confidence and keeps only text reasons", () => {
    const r = parseVerdictText('{"verdict":"unclear","confidence":7,"reasons":["  a  ",3,""]}');
    assert.deepEqual(r, { verdict: "unclear", confidence: 0.5, reasons: ["a"] });
  });
});
