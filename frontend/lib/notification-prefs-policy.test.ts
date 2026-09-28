import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../supabase/migrations/0064_notification_prefs_single_policy.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("0064 migration", () => {
  it("drops all three old self policies", () => {
    for (const name of [
      "notif_prefs_self",
      "notification_prefs_self_read",
      "notification_prefs_self_upsert",
    ]) {
      assert.match(
        migration,
        new RegExp(
          `drop policy if exists ${name} on public\\.notification_preferences;`,
        ),
      );
    }
  });

  it("creates exactly one self policy for authenticated", () => {
    const creates = migration.match(/create policy/gi) ?? [];
    assert.equal(creates.length, 1);
    assert.match(
      migration,
      /create policy notification_prefs_self\s+on public\.notification_preferences\s+for all\s+to authenticated\s+using \(\(select auth\.uid\(\)\) = member_id\)\s+with check \(\(select auth\.uid\(\)\) = member_id\);/,
    );
  });

  it("swaps policies inside one transaction", () => {
    assert.match(migration, /^begin;$/m);
    assert.match(migration, /^commit;$/m);
  });

  it("does no data writes", () => {
    assert.doesNotMatch(migration, /^\s*(update|delete|insert)\b/im);
  });
});
