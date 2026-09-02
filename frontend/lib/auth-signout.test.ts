import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const helper = readFileSync(
  fileURLToPath(new URL("./auth-signout.ts", import.meta.url)),
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
  it("calls Supabase signOut and 303s to a safe path", () => {
    assert.match(helper, /supabase\.auth\.signOut/);
    assert.match(helper, /status: 303/);
    assert.match(helper, /safeRelativePath/);
  });

  it("exposes GET+POST on /logout, /signout, and /auth/signout", () => {
    for (const src of [logoutRoute, signoutRoute, authSignoutRoute]) {
      assert.match(src, /export async function GET/);
      assert.match(src, /export async function POST/);
      assert.match(src, /signOutAndRedirect/);
    }
  });

  it("header Sign out uses client signOut then /logout", () => {
    assert.match(userMenu, /supabase\.auth\.signOut/);
    assert.match(userMenu, /window\.location\.assign\("\/logout"\)/);
    assert.doesNotMatch(userMenu, /action="\/auth\/signout"/);
  });

  it("marks the new doors no-store like other auth routes", () => {
    assert.match(nextConfig, /"\/logout"/);
    assert.match(nextConfig, /"\/signout"/);
  });
});
