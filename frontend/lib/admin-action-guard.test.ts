import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const APP_DIR = fileURLToPath(new URL("../app", import.meta.url));

/** Calls that resolve the admin through lib/admin.ts. */
const ADMIN_HELPER =
  /\b(getAdminContext|requireAdminContext|getAdminCommunityId|getAdminUser|getAdminPageScope)\(/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Top-level function declarations in a file, keyed by name. */
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

/** True when the function calls a helper, directly or through local wrappers. */
function reachesHelper(
  name: string,
  fns: Map<string, { body: string }>,
  seen = new Set<string>(),
): boolean {
  if (seen.has(name)) return false;
  seen.add(name);
  const body = fns.get(name)?.body ?? "";
  if (ADMIN_HELPER.test(body)) return true;
  for (const other of fns.keys()) {
    if (other !== name && new RegExp(`\\b${other}\\(`).test(body)) {
      if (reachesHelper(other, fns, seen)) return true;
    }
  }
  return false;
}

const adminActionFiles = walk(join(APP_DIR, "admin")).filter((f) =>
  f.endsWith("actions.ts"),
);

describe("admin server actions use the shared admin helpers", () => {
  it("finds the admin action files", () => {
    assert.ok(adminActionFiles.length >= 19, String(adminActionFiles.length));
  });

  for (const file of adminActionFiles) {
    const rel = file.slice(APP_DIR.length + 1);
    it(`${rel}: every exported action checks the admin via lib/admin`, () => {
      const src = readFileSync(file, "utf8");
      assert.match(src, /^"use server";/, rel);
      assert.match(src, /from "@\/lib\/admin"/, rel);
      const fns = functions(src);
      const exported = [...fns].filter(([, f]) => f.exported);
      assert.ok(exported.length > 0, rel);
      for (const [name] of exported) {
        assert.ok(reachesHelper(name, fns), `${rel}: ${name} has no admin check`);
      }
    });
  }
});

describe("admin access is only resolved in lib/admin.ts", () => {
  it("no app code reads the ADMIN_EMAILS allowlist", () => {
    for (const file of walk(APP_DIR)) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /process\.env\.ADMIN_EMAILS/, file);
    }
  });
});
