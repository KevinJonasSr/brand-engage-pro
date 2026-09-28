import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/0066_credit_moved_points.sql", import.meta.url)),
  "utf8",
);

// Code only, so the header's explanation does not count.
const code = migration.replace(/--.*$/gm, "");

describe("0066 credit moved points", () => {
  it("only updates Nellie's membership totals", () => {
    assert.match(code, /update public\.member_community_memberships m/);
    assert.match(code, /where community_id = 'nellies'/);
    assert.doesNotMatch(code, /update public\.members\b/);
    assert.doesNotMatch(code, /insert into/);
    assert.doesNotMatch(code, /jonas-group/);
  });

  it("raises short totals to the ledger sum, so a rerun changes nothing", () => {
    assert.match(code, /set total_points = s\.ledger_sum/);
    assert.match(code, /and coalesce\(m\.total_points, 0\) < s\.ledger_sum;/);
  });

  it("recomputes the tier from the new total", () => {
    assert.match(code, /t\.min_points <= s\.ledger_sum\s+order by t\.min_points desc limit 1/);
  });

  it("refuses to run if more memberships are short than expected", () => {
    assert.match(code, /if v_short > 4 then/);
    assert.match(code, /raise exception 'Expected at most 4 short memberships, found %'/);
  });
});
