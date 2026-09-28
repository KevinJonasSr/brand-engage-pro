import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL("../../supabase/migrations/0062_redeem_reward_ledger_community.sql", import.meta.url),
  ),
  "utf8",
);

describe("0062 redeem_reward ledger community", () => {
  const ledgerInsert = migration.slice(migration.indexOf("insert into points_ledger"));

  it("writes community_id on the spend row", () => {
    assert.match(
      ledgerInsert,
      /insert into points_ledger \(member_id, delta, source, source_ref, community_id, note\)/,
    );
    assert.match(ledgerInsert, /coalesce\(v_reward\.community_id, 'raelynn'\)/);
  });

  it("keeps the self-only guard for members", () => {
    assert.match(migration, /auth\.uid\(\) is distinct from p_member_id/);
    assert.match(migration, /raise exception 'Not authenticated'/);
  });

  it("keeps the reward row lock and the stock check", () => {
    assert.match(migration, /from rewards_catalog where id = p_reward_id\s+for update;/);
    assert.match(migration, /v_reward\.stock <= 0/);
  });

  it("stays callable by members and never by anon", () => {
    assert.match(
      migration,
      /revoke execute on function public\.redeem_reward\(uuid, uuid, text\) from public, anon;/,
    );
    assert.match(
      migration,
      /grant execute on function public\.redeem_reward\(uuid, uuid, text\) to authenticated, service_role;/,
    );
  });
});
