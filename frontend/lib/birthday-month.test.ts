import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BIRTHDAY_MONTHS,
  BIRTHDAY_MONTH_LOCKED_ERROR,
  birthdayMonthLabel,
  parseBirthdayMonth,
  planBirthdayMonthSave,
} from "./birthday-month.ts";

function src(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

const action = src("../app/me/birthday/actions.ts");
const page = src("../app/me/birthday/page.tsx");
const mePage = src("../app/me/page.tsx");
const settingsRedirect = src("../app/settings/birthday/page.tsx");
const onboardRoute = src("../app/api/member-engage/onboard/route.ts");

describe("parseBirthdayMonth", () => {
  it("accepts 1-12 as numbers or strings", () => {
    assert.equal(parseBirthdayMonth(1), 1);
    assert.equal(parseBirthdayMonth("12"), 12);
  });

  it("treats empty and null as a clear", () => {
    assert.equal(parseBirthdayMonth(""), null);
    assert.equal(parseBirthdayMonth(null), null);
  });

  it("rejects out-of-range and junk", () => {
    for (const bad of [0, 13, -1, "abc", 1.5, "0"]) {
      assert.equal(parseBirthdayMonth(bad), undefined, String(bad));
    }
    assert.equal(parseBirthdayMonth(undefined), undefined);
  });
});

describe("birthdayMonthLabel", () => {
  it("names the month", () => {
    assert.equal(BIRTHDAY_MONTHS.length, 12);
    assert.equal(birthdayMonthLabel(1), "January");
    assert.equal(birthdayMonthLabel(12), "December");
  });

  it("returns null when unset or invalid", () => {
    assert.equal(birthdayMonthLabel(null), null);
    assert.equal(birthdayMonthLabel(undefined), null);
    assert.equal(birthdayMonthLabel(0), null);
  });
});

describe("planBirthdayMonthSave", () => {
  it("saves a valid month when none is set", () => {
    assert.deepEqual(planBirthdayMonthSave(null, "3"), { ok: true, month: 3 });
    assert.deepEqual(planBirthdayMonthSave(undefined, "10"), { ok: true, month: 10 });
  });

  it("refuses to change a month that is already set", () => {
    assert.deepEqual(planBirthdayMonthSave(5, "6"), {
      ok: false,
      error: BIRTHDAY_MONTH_LOCKED_ERROR,
    });
  });

  it("asks for a month when the choice is empty or invalid", () => {
    for (const raw of ["", null, "13", "abc"]) {
      const result = planBirthdayMonthSave(null, raw);
      assert.equal(result.ok, false, String(raw));
    }
  });
});

describe("/me/birthday wiring", () => {
  it("writes as the member, only while the month is still null", () => {
    assert.match(action, /^"use server";/);
    assert.match(action, /createClient\(\)/);
    assert.doesNotMatch(action, /createAdminClient/);
    assert.match(action, /\.update\(\{ birthday_month: plan\.month \}\)\s+\.eq\("id", user\.id\)\s+\.is\("birthday_month", null\)/);
  });

  it("reports failures instead of swallowing them", () => {
    assert.match(action, /if \(error\) \{\s+console\.error/);
    assert.match(action, /updated\.length === 0/);
  });

  it("sends signed-out visitors to login", () => {
    assert.match(page, /redirect\("\/login\?next=\/me\/birthday"\)/);
  });

  it("is linked from /me and /settings/birthday", () => {
    assert.match(mePage, /href="\/me\/birthday"/);
    assert.match(settingsRedirect, /redirect\("\/me\/birthday"\)/);
  });

  it("onboarding uses the shared parser", () => {
    assert.match(onboardRoute, /import \{ parseBirthdayMonth \} from "@\/lib\/birthday-month";/);
    assert.doesNotMatch(onboardRoute, /function parseBirthdayMonth/);
  });

  it("onboarding only fills an unset month", () => {
    assert.match(
      onboardRoute,
      /\.update\(\{ birthday_month: birthdayMonth \}\)\s+\.eq\("id", user\.id\)\s+(\/\/[^\n]*\s+)?\.is\("birthday_month", null\)/,
    );
  });
});

describe("0068 birthday month lock", () => {
  const sql = src("../../supabase/migrations/0068_lock_birthday_month.sql");

  it("rejects member changes once the month is set", () => {
    assert.match(sql, /if current_user not in \('authenticated', 'anon'\) then\s+return new;/);
    assert.match(
      sql,
      /old\.birthday_month is not null\s+and new\.birthday_month is distinct from old\.birthday_month/,
    );
    assert.match(sql, /errcode = '42501'/);
  });

  it("runs before updates of birthday_month on members", () => {
    assert.match(
      sql,
      /create trigger members_lock_birthday_month\s+before update of birthday_month on public\.members\s+for each row execute function public\.members_lock_birthday_month\(\);/,
    );
  });

  it("is not a definer function and is not callable by clients", () => {
    assert.match(sql, /returns trigger\s+language plpgsql\s+set search_path to 'public'\s+as \$\$/);
    assert.match(sql, /revoke all on function public\.members_lock_birthday_month\(\) from public, anon, authenticated;/);
  });
});
