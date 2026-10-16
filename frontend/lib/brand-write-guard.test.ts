import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isLockedAdminWritePath } from "./brand-billing.ts";

const APP_DIR = fileURLToPath(new URL("../app", import.meta.url));
const LIB_DIR = fileURLToPath(new URL(".", import.meta.url));

/** Billing stays reachable. Preview is a read. The switcher is not a brand write. */
const EXEMPT = new Set([
  "admin/billing/actions.ts:startBrandCheckoutAction",
  "admin/billing/actions.ts:openBrandPortalAction",
  "admin/billing/actions.ts:grantFreeSlotAction",
  "admin/communities/actions.ts:setActiveCommunityAction",
  "admin/broadcast/actions.ts:previewRecipientCount",
]);

const WRITE_GUARD = /\b(requireWritableBrand|writableBrandError)\(/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function functions(src: string): Map<string, { exported: boolean; body: string }> {
  const found = new Map<string, { exported: boolean; body: string }>();
  const re = /^(export )?async function (\w+)\(/gm;
  const starts = [...src.matchAll(re)];
  starts.forEach((m, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : src.length;
    found.set(m[2], { exported: Boolean(m[1]), body: src.slice(m.index, end) });
  });
  return found;
}

function reachesGuard(
  name: string,
  fns: Map<string, { body: string }>,
  seen = new Set<string>(),
): boolean {
  if (seen.has(name)) return false;
  seen.add(name);
  const body = fns.get(name)?.body ?? "";
  if (WRITE_GUARD.test(body)) return true;
  for (const other of fns.keys()) {
    if (other !== name && new RegExp(`\\b${other}\\(`).test(body)) {
      if (reachesGuard(other, fns, seen)) return true;
    }
  }
  return false;
}

describe("locked brand writes are refused inside the action, not by URL", () => {
  it("the proxy still lets /admin/billing and non-admin paths through", () => {
    assert.equal(isLockedAdminWritePath("/admin/billing"), false);
    assert.equal(isLockedAdminWritePath("/brands/nellies/community"), false);
  });

  it("requireWritableBrand does not read the request path", () => {
    const src = readFileSync(join(LIB_DIR, "admin.ts"), "utf8");
    const start = src.indexOf("export async function requireWritableBrand");
    const end = src.indexOf("export async function writableBrandError");
    const body = src.slice(start, end);
    assert.ok(start >= 0 && end > start);
    assert.match(body, /ctx\.isSuperAdmin/);
    assert.match(body, /brandWriteDecision/);
    assert.doesNotMatch(body, /pathname|next-action|headers\(/);
  });

  it("the proxy fails closed when the lock lookup errors", () => {
    const src = readFileSync(join(LIB_DIR, "../proxy.ts"), "utf8");
    assert.match(src, /BRAND_WRITE_TRY_AGAIN_MESSAGE/);
    assert.match(src, /status: 503/);
    assert.doesNotMatch(src, /Fails open/);
  });
});

describe("admin mutations call requireWritableBrand", () => {
  const files = walk(join(APP_DIR, "admin")).filter((f) => f.endsWith("actions.ts"));

  for (const file of files) {
    const rel = file.slice(APP_DIR.length + 1);
    const fns = functions(readFileSync(file, "utf8"));
    for (const [name, fn] of fns) {
      if (!fn.exported) continue;
      const key = `${rel}:${name}`;
      if (EXEMPT.has(key)) {
        it(`${key} stays reachable while a brand is locked`, () => {
          assert.equal(reachesGuard(name, fns), false, key);
        });
      } else {
        it(`${key} checks the billing lock`, () => {
          assert.equal(reachesGuard(name, fns), true, key);
        });
      }
    }
  }
});

describe("admin mutations outside /admin still check the lock", () => {
  const cases: Array<{ file: string; locked: string[]; open: string[] }> = [
    {
      file: "brands/[slug]/community/actions.ts",
      locked: [
        "createPollAction",
        "createChallengeAction",
        "createAnnouncementAction",
        "togglePinAction",
        "deletePostAction",
      ],
      open: [
        "createPostAction",
        "toggleReactionAction",
        "addCommentAction",
        "votePollAction",
        "submitEntryAction",
      ],
    },
    {
      file: "brands/[slug]/community/predictions-actions.ts",
      locked: ["createPredictionAction", "resolvePredictionAction"],
      open: ["votePredictionAction"],
    },
  ];

  for (const spec of cases) {
    const fns = functions(readFileSync(join(APP_DIR, spec.file), "utf8"));
    for (const name of spec.locked) {
      it(`${spec.file} ${name} checks the billing lock`, () => {
        assert.equal(reachesGuard(name, fns), true, name);
      });
    }
    for (const name of spec.open) {
      it(`${spec.file} ${name} stays open for members`, () => {
        assert.equal(reachesGuard(name, fns), false, name);
      });
    }
  }
});

describe("stripe-seed bearer", () => {
  it("compares the secret in constant time and returns 401 when it is unset", () => {
    const src = readFileSync(
      join(APP_DIR, "api/admin/stripe-seed/route.ts"),
      "utf8",
    );
    assert.match(src, /bearerSecretMatches/);
    assert.match(src, /status: 401/);
    assert.doesNotMatch(src, /auth !== `Bearer/);
    assert.doesNotMatch(src, /STRIPE_SEED_SECRET not configured/);
  });
});
