import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL("../../supabase/migrations/0067_pre_join_points_follow_first_brand.sql", import.meta.url),
  ),
  "utf8",
);

// Everything after the header comment, so the explanation does not count as code.
const code = migration.slice(migration.indexOf("create or replace function"));

function fnBody(name: string): string {
  const start = code.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const end = code.indexOf("$function$;", start);
  return code.slice(start, end);
}

describe("0067 pre-join points follow the first brand", () => {
  it("moves ledger rows, badges and notifications off jonas-group", () => {
    const body = fnBody("move_pre_join_points");
    assert.match(body, /update points_ledger l\s+set community_id = p_community_id/);
    assert.match(body, /update member_badges\s+set community_id = p_community_id/);
    assert.match(body, /update notifications\s+set community_id = p_community_id/);
  });

  it("skips ledger rows that would break the source_ref unique index", () => {
    const body = fnBody("move_pre_join_points");
    assert.match(body, /t\.source = l\.source\s+and t\.source_ref = l\.source_ref/);
  });

  it("drops a badge the member already holds on the brand before moving", () => {
    const body = fnBody("move_pre_join_points");
    const del = body.indexOf("delete from member_badges");
    const upd = body.indexOf("update member_badges");
    assert.ok(del >= 0 && upd > del, "delete must run before the badge move");
  });

  it("credits only the moved points to the membership, never members.total_points", () => {
    const body = fnBody("move_pre_join_points");
    assert.match(body, /returning l\.delta/);
    assert.match(body, /perform bump_membership_points\(p_member_id, p_community_id, v_points\)/);
    assert.doesNotMatch(body, /update members\b/);
  });

  it("credits in place when the first brand is jonas-group", () => {
    const body = fnBody("move_pre_join_points");
    assert.match(body, /if p_community_id = 'jonas-group' then\s+select coalesce\(sum\(delta\), 0\)/);
  });

  it("runs only on the member's first membership", () => {
    const body = fnBody("pre_join_points_on_first_membership");
    assert.match(body, /community_id <> new\.community_id/);
    assert.match(body, /perform move_pre_join_points\(new\.member_id, new\.community_id\)/);
    assert.match(
      code,
      /create trigger pre_join_points_on_first_membership\s+after insert on public\.member_community_memberships/,
    );
  });

  it("locks the functions down to the service role", () => {
    assert.match(
      code,
      /revoke execute on function public\.move_pre_join_points\(uuid, text\) from public, anon, authenticated;/,
    );
    assert.match(code, /grant execute on function public\.move_pre_join_points\(uuid, text\) to service_role;/);
    assert.match(
      code,
      /revoke execute on function public\.pre_join_points_on_first_membership\(\) from public, anon, authenticated;/,
    );
    for (const name of ["move_pre_join_points", "pre_join_points_on_first_membership"]) {
      assert.match(fnBody(name), /security definer set search_path to 'public'/, name);
    }
  });

  it("backfills existing members to their home brand, skipping jonas-group", () => {
    const block = code.slice(code.lastIndexOf("do $$"));
    assert.match(block, /public\.member_home_community\(l\.member_id\)/);
    assert.match(block, /if r\.home <> 'jonas-group' then/);
  });

  it("reloads the PostgREST schema", () => {
    assert.match(code, /notify pgrst, 'reload schema';\s*$/);
  });
});
