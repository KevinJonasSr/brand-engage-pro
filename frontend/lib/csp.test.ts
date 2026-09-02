import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CONTENT_SECURITY_POLICY, TURNSTILE_CSP_HOST } from "./csp.ts";

const nextConfigSrc = readFileSync(
  fileURLToPath(new URL("../next.config.ts", import.meta.url)),
  "utf8",
);

describe("Turnstile CSP for www signup", () => {
  it("allows Cloudflare script, frame, child, and blob workers", () => {
    assert.match(CONTENT_SECURITY_POLICY, /script-src[^;]*blob:/);
    assert.match(CONTENT_SECURITY_POLICY, new RegExp(`script-src[^;]*${TURNSTILE_CSP_HOST}`));
    assert.match(CONTENT_SECURITY_POLICY, new RegExp(`frame-src ${TURNSTILE_CSP_HOST}`));
    assert.match(CONTENT_SECURITY_POLICY, new RegExp(`child-src ${TURNSTILE_CSP_HOST}`));
    assert.match(CONTENT_SECURITY_POLICY, /worker-src 'self' blob:/);
    assert.match(CONTENT_SECURITY_POLICY, new RegExp(`worker-src[^;]*${TURNSTILE_CSP_HOST}`));
  });

  it("is the header next.config sends", () => {
    assert.match(nextConfigSrc, /CONTENT_SECURITY_POLICY/);
    assert.doesNotMatch(
      nextConfigSrc,
      /default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:\/\/challenges\.cloudflare\.com;/,
    );
  });
});
