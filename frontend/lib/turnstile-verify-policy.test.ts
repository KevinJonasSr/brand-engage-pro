import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { turnstileUpstreamFailOpen } from "./turnstile-verify-policy.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

describe("Turnstile verify fail-open policy", () => {
  it("fails closed for failClosed requests and for production", () => {
    assert.equal(
      turnstileUpstreamFailOpen({ failClosedRequest: true, failOpenEnv: undefined }),
      false,
    );
    assert.equal(
      turnstileUpstreamFailOpen({ vercelEnv: "production", failOpenEnv: undefined }),
      false,
    );
    assert.equal(
      turnstileUpstreamFailOpen({ vercelEnv: "preview", failOpenEnv: undefined }),
      true,
    );
    assert.equal(
      turnstileUpstreamFailOpen({ vercelEnv: "preview", failOpenEnv: "0" }),
      false,
    );
  });

  it("verify route rejects missing tokens and uses the policy", () => {
    const route = readRepo("../app/api/turnstile/verify/route.ts");
    assert.match(route, /missing_token/);
    assert.match(route, /turnstileUpstreamFailOpen/);
    assert.match(route, /failClosed/);
    assert.match(route, /failClosedRequest/);
  });

  it("client verify helper sends failClosed and magic-link uses it", () => {
    const widget = readRepo("../components/turnstile-widget.tsx");
    assert.match(widget, /opts\?: \{ failClosed\?: boolean \}/);
    assert.match(widget, /JSON\.stringify\(\{ token, failClosed \}\)/);
    const login = readRepo("../app/login/login-client.tsx");
    assert.match(login, /verifyTurnstileToken\(token, \{ failClosed: true \}\)/);
  });

  it("password login binds captchaToken and does not spend the token on /verify", () => {
    const login = readRepo("../app/login/login-client.tsx");
    const passwordFn = login.slice(
      login.indexOf("async function handlePassword"),
      login.indexOf("const magicGate"),
    );
    assert.match(passwordFn, /buildPasswordAuthCredentials/);
    assert.match(passwordFn, /signInWithPassword\(credentials\)/);
    assert.doesNotMatch(passwordFn, /verifyTurnstileToken/);
  });

  it("signup binds captchaToken and does not spend the token on /verify", () => {
    const signup = readRepo("../app/signup/signup-client.tsx");
    assert.match(signup, /buildSignupAuthOptions/);
    assert.match(signup, /turnstileToken,/);
    assert.doesNotMatch(signup, /verifyTurnstileToken/);
  });
});
