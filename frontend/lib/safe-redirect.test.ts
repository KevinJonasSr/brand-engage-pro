import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeRelativePath } from "./safe-redirect.ts";

describe("safeRelativePath", () => {
  it("keeps normal same-site paths", () => {
    assert.equal(safeRelativePath("/"), "/");
    assert.equal(safeRelativePath("/brands/nellies"), "/brands/nellies");
    assert.equal(
      safeRelativePath("/onboarding?brand=nellies#top"),
      "/onboarding?brand=nellies#top",
    );
    assert.equal(safeRelativePath("%2Frewards"), "/rewards");
  });

  it("returns the fallback for empty input", () => {
    assert.equal(safeRelativePath(null), "/");
    assert.equal(safeRelativePath(undefined, "/home"), "/home");
    assert.equal(safeRelativePath("", ""), "");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    for (const v of [
      "https://evil.com",
      "http://evil.com/path",
      "//evil.com",
      "///evil.com",
      "javascript:alert(1)",
      "evil.com",
      "%2F%2Fevil.com",
      "/%2F%2Fevil.com",
      "/%2Fevil.com",
      "https%3A%2F%2Fevil.com",
    ]) {
      assert.equal(safeRelativePath(v), "/", v);
    }
  });

  it("rejects backslash variants, raw and encoded", () => {
    for (const v of [
      "/\\evil.com",
      "\\\\evil.com",
      "/\\/evil.com",
      "/%5Cevil.com",
      "%2F%5Cevil.com",
      "/path\\to",
    ]) {
      assert.equal(safeRelativePath(v), "/", v);
    }
  });

  it("rejects tabs, newlines and other control or whitespace characters", () => {
    for (const v of [
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "/%09/evil.com",
      "/%0A/evil.com",
      "/%0D/evil.com",
      "%2F%09%2Fevil.com",
      "/\u0000/evil.com",
      "/%00/evil.com",
      "/%7F",
      "/ /evil.com",
      "/%20/evil.com",
      "/ /evil.com",
      "/​/evil.com",
      "/﻿/evil.com",
      "/ /evil.com",
      "/%E2%80%8B/evil.com",
    ]) {
      assert.equal(safeRelativePath(v), "/", JSON.stringify(v));
    }
  });

  it("rejects malformed percent-encoding", () => {
    assert.equal(safeRelativePath("/%E0%A4%A"), "/");
  });

  it("keeps a double-encoded path on our own site", () => {
    // Decoded once, this is a literal path segment, not another host.
    const out = safeRelativePath("/%252F%252Fevil.com");
    assert.ok(out.startsWith("/") && !out.startsWith("//"), out);
  });

  it("normalizes dot segments without leaving the site", () => {
    assert.equal(safeRelativePath("/a/../b"), "/b");
    assert.equal(safeRelativePath("/../../evil.com"), "/evil.com");
  });
});
