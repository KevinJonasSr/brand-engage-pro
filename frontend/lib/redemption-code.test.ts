import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  appBaseUrl,
  codeLookupUrl,
  formatShortCode,
  generateShortCode,
  isActiveWalletItem,
  isValidShortCode,
  memberCardUrl,
  normalizeShortCode,
  partitionWallet,
  perkTitle,
  walletStatusLabel,
  type WalletItem,
} from "./redemption-code.ts";

function src(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

describe("SHORT_CODE_ALPHABET", () => {
  it("has 32 unique symbols and none of 0, O, 1, I", () => {
    assert.equal(SHORT_CODE_ALPHABET.length, 32);
    assert.equal(new Set(SHORT_CODE_ALPHABET).size, 32);
    for (const bad of ["0", "O", "1", "I"]) {
      assert.ok(!SHORT_CODE_ALPHABET.includes(bad), `alphabet contains ${bad}`);
    }
    assert.equal(SHORT_CODE_LENGTH, 6);
  });

  it("matches the alphabet in migration 0084", () => {
    const sql = src("../../supabase/migrations/0084_redemption_codes.sql");
    assert.ok(sql.includes(`'${SHORT_CODE_ALPHABET}'`), "migration alphabet drifted");
    assert.ok(sql.includes("redemption_short_code(6)"));
    assert.ok(sql.includes("add column if not exists short_code text"));
  });
});

describe("generateShortCode", () => {
  it("produces valid six-character codes", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateShortCode();
      assert.equal(code.length, 6);
      assert.ok(isValidShortCode(code), code);
    }
  });

  it("is deterministic for a given rng and clamps edge values", () => {
    assert.equal(generateShortCode(() => 0), "AAAAAA");
    assert.equal(generateShortCode(() => 0.999999), "999999");
    // Out-of-range rng values never index past the alphabet.
    assert.equal(generateShortCode(() => 1), "999999");
    assert.equal(generateShortCode(() => -1), "AAAAAA");
  });
});

describe("normalizeShortCode / isValidShortCode", () => {
  it("uppercases and strips separators", () => {
    assert.equal(normalizeShortCode(" k7m-3px "), "K7M3PX");
    assert.equal(normalizeShortCode("k7m 3px"), "K7M3PX");
    assert.equal(normalizeShortCode("K7M_3.PX"), "K7M3PX");
  });

  it("accepts a scanned lookup URL", () => {
    assert.equal(
      normalizeShortCode("https://example.com/admin/redemptions/k7m3px?x=1"),
      "K7M3PX",
    );
    assert.equal(normalizeShortCode("/admin/redemptions/K7M3PX/"), "K7M3PX");
  });

  it("handles empty input", () => {
    assert.equal(normalizeShortCode(null), "");
    assert.equal(normalizeShortCode(undefined), "");
    assert.equal(normalizeShortCode("   "), "");
    assert.equal(isValidShortCode(""), false);
    assert.equal(isValidShortCode(null), false);
  });

  it("rejects wrong length and excluded symbols", () => {
    assert.equal(isValidShortCode("K7M3PX"), true);
    assert.equal(isValidShortCode("K7M3P"), false);
    assert.equal(isValidShortCode("K7M3PXA"), false);
    assert.equal(isValidShortCode("K0M3PX"), false);
    assert.equal(isValidShortCode("KOM3PX"), false);
    assert.equal(isValidShortCode("K1M3PX"), false);
    assert.equal(isValidShortCode("KIM3PX"), false);
    assert.equal(isValidShortCode("k7m3px"), false, "validation is case-sensitive; normalize first");
  });

  it("formats as two groups of three", () => {
    assert.equal(formatShortCode("k7m3px"), "K7M 3PX");
    assert.equal(formatShortCode("ABC"), "ABC");
  });
});

describe("URLs", () => {
  it("uses NEXT_PUBLIC_APP_URL without a trailing slash", () => {
    assert.equal(appBaseUrl({ NEXT_PUBLIC_APP_URL: "https://x.test/" }), "https://x.test");
    assert.equal(appBaseUrl({}), "https://brand-engage-pro.vercel.app");
  });

  it("builds staff lookup and member card URLs", () => {
    assert.equal(codeLookupUrl("k7m 3px", "https://x.test"), "https://x.test/admin/redemptions/K7M3PX");
    assert.equal(memberCardUrl("abc-123", "https://x.test/"), "https://x.test/members/abc-123");
  });
});

describe("wallet helpers", () => {
  const item = (over: Partial<WalletItem>): WalletItem => ({
    kind: "redemption",
    id: "x",
    code: "K7M3PX",
    brandSlug: "nellies",
    brandName: "Nellie's",
    title: "Reward",
    status: "pending",
    createdAt: "2026-10-01T00:00:00Z",
    resolvedAt: null,
    note: null,
    ...over,
  });

  it("treats pending redemptions and unused perks as active", () => {
    assert.equal(isActiveWalletItem({ status: "pending" }), true);
    assert.equal(isActiveWalletItem({ status: "unused" }), true);
    assert.equal(isActiveWalletItem({ status: "fulfilled" }), false);
    assert.equal(isActiveWalletItem({ status: "used" }), false);
    assert.equal(isActiveWalletItem({ status: "cancelled" }), false);
  });

  it("partitions and sorts newest first", () => {
    const items = [
      item({ id: "a", status: "pending", createdAt: "2026-10-01T00:00:00Z" }),
      item({ id: "b", status: "fulfilled", createdAt: "2026-09-01T00:00:00Z", resolvedAt: "2026-09-20T00:00:00Z" }),
      item({ id: "c", status: "unused", createdAt: "2026-10-05T00:00:00Z", kind: "perk" }),
      item({ id: "d", status: "cancelled", createdAt: "2026-09-10T00:00:00Z", resolvedAt: "2026-09-25T00:00:00Z" }),
      item({ id: "e", status: "used", createdAt: "2026-08-01T00:00:00Z", resolvedAt: null, kind: "perk" }),
    ];
    const { active, history } = partitionWallet(items);
    assert.deepEqual(active.map((i) => i.id), ["c", "a"]);
    assert.deepEqual(history.map((i) => i.id), ["d", "b", "e"]);
  });

  it("labels every status", () => {
    for (const s of ["pending", "unused", "fulfilled", "used", "cancelled"] as const) {
      assert.ok(walletStatusLabel(s).length > 0);
    }
    assert.equal(walletStatusLabel("pending"), "Ready to redeem");
  });

  it("names known perks and humanises unknown slugs", () => {
    assert.equal(perkTitle("nsk-welcome-dessert"), "Free Dessert w/ Entree");
    assert.equal(perkTitle("nsk-birthday-entree"), "Birthday Entree up to $30");
    assert.equal(perkTitle("nsk-free-coffee"), "Free coffee");
    assert.equal(perkTitle("vip_lane"), "Vip lane");
    assert.equal(perkTitle(""), "Member perk");
    assert.equal(perkTitle(null), "Member perk");
  });
});

describe("staff lookup page", () => {
  it("uses getAdminContext and the shared fulfil/cancel actions", () => {
    const page = src("../app/admin/redemptions/[code]/page.tsx");
    assert.ok(page.includes("getAdminContext"), "must gate with getAdminContext");
    assert.ok(!page.includes("ADMIN_EMAILS"), "no inline admin checks");
    assert.ok(page.includes("findWalletItemByCode"));
    const actions = src("../app/admin/redemptions/[code]/code-actions.tsx");
    assert.ok(actions.includes('from "../actions"'), "reuses existing redemption actions");
  });
});
