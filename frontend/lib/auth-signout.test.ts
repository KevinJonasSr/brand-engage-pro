import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const helper = readFileSync(
  fileURLToPath(new URL("./auth-signout.ts", import.meta.url)),
  "utf8",
);
const browser = readFileSync(
  fileURLToPath(new URL("./auth-signout-browser.ts", import.meta.url)),
  "utf8",
);
const logoutRoute = readFileSync(
  fileURLToPath(new URL("../app/logout/route.ts", import.meta.url)),
  "utf8",
);
const signoutRoute = readFileSync(
  fileURLToPath(new URL("../app/signout/route.ts", import.meta.url)),
  "utf8",
);
const authSignoutRoute = readFileSync(
  fileURLToPath(new URL("../app/auth/signout/route.ts", import.meta.url)),
  "utf8",
);
const userMenu = readFileSync(
  fileURLToPath(new URL("../components/user-menu.tsx", import.meta.url)),
  "utf8",
);
const nextConfig = readFileSync(
  fileURLToPath(new URL("../next.config.ts", import.meta.url)),
  "utf8",
);

describe("sign-out doors (FE /logout /signout 404 parity)", () => {
  it("revokes globally and expires sb-* cookies on the 303 response", () => {
    assert.match(helper, /scope:\s*"global"/);
    assert.match(helper, /expireAuthCookiesOnResponse/);
    assert.match(helper, /stampSignedOutCookie|SIGNED_OUT_COOKIE/);
    assert.match(helper, /clearOnboardedCookie|ONBOARDED_COOKIE/);
    assert.match(helper, /status: 303/);
    assert.match(helper, /safeRelativePath/);
    assert.doesNotMatch(helper, /return NextResponse\.redirect[\s\S]*signOut/);
  });

  it("exposes GET+POST on /logout, /signout, and /auth/signout", () => {
    for (const src of [logoutRoute, signoutRoute, authSignoutRoute]) {
      assert.match(src, /export async function GET/);
      assert.match(src, /export async function POST/);
      assert.match(src, /signOutAndRedirect/);
    }
  });

  it("header Sign out hard-navigates GET /logout after wiping stores", () => {
    assert.match(userMenu, /hardSignOut/);
    assert.match(browser, /scope:\s*"global"/);
    assert.match(browser, /clearBrowserAuthStorage/);
    assert.match(browser, /stampBrowserSignedOut/);
    assert.match(browser, /window\.location\.replace\("\/logout"\)/);
    assert.doesNotMatch(userMenu, /window\.location\.assign\("\/logout"\)/);
    assert.doesNotMatch(userMenu, /action="\/auth\/signout"/);
  });

  it("marks the new doors no-store like other auth routes", () => {
    assert.match(nextConfig, /"\/logout"/);
    assert.match(nextConfig, /"\/signout"/);
  });
});
