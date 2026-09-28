import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

function fallbackThresholds(src: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of src.matchAll(/slug:\s*"(\w+)",[\s\S]*?min_points:\s*(\d+)/g)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

function migrationThresholds(sql: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of sql.matchAll(/set min_points\s*=\s*(\d+)\s+where slug\s*=\s*'(\w+)'/g)) {
    out[m[2]] = Number(m[1]);
  }
  return out;
}

describe("tier fallback matches the database ladder", () => {
  it("uses the 750 / 3,500 / 8,000 thresholds from migration 0047", () => {
    const fallback = fallbackThresholds(readRepo("./tiers.ts"));
    const db = migrationThresholds(
      readRepo("../../../supabase/migrations/0047_economy_rebalance.sql"),
    );

    assert.equal(fallback.bronze, 0);
    assert.deepEqual(db, { silver: 750, gold: 3500, platinum: 8000 });
    for (const [slug, points] of Object.entries(db)) {
      assert.equal(fallback[slug], points, `${slug} fallback drifted from 0047`);
    }
  });
});
