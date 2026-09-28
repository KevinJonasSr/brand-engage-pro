import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/0065_remove_raelynn_from_bep.sql", import.meta.url)),
  "utf8",
);

// Everything after the header comment, so the explanation of the old state
// does not count as code.
const code = migration.slice(migration.indexOf("create or replace function public.member_home_community"));

const TABLES = [
  "brand_events",
  "campaigns",
  "community_posts",
  "event_reminders",
  "event_rsvps",
  "member_action_completions",
  "member_actions",
  "member_badges",
  "notifications",
  "points_ledger",
  "purchases",
  "referrals",
  "specials",
];

function fnBody(name: string): string {
  const start = code.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  const end = code.indexOf("$function$;", start);
  return code.slice(start, end);
}

describe("0065 remove raelynn from BEP", () => {
  it("only mentions raelynn in the row moves", () => {
    const withoutMoves = code
      .replace(/--.*$/gm, "")
      .replace(/\b[a-z]*\.?community_id = 'raelynn'/g, "");
    assert.doesNotMatch(withoutMoves, /raelynn/);
  });

  it("defaults a member with no brand to jonas-group", () => {
    assert.match(fnBody("member_home_community"), /'jonas-group'/);
    assert.match(fnBody("member_home_community"), /order by joined_at asc nulls last/);
  });

  it("award_badge uses the member's home brand", () => {
    assert.match(fnBody("award_badge"), /member_home_community\(p_member_id\)/);
  });

  it("badge points carry the community and bump the membership", () => {
    const body = fnBody("award_community_badge");
    assert.match(body, /source, source_ref, community_id, note\)/);
    assert.match(body, /bump_membership_points\(p_member_id, p_community_id, v_points\)/);
    assert.match(body, /p_community_id\s*\);/);
  });

  it("the three point triggers write community_id and bump the membership", () => {
    for (const name of [
      "award_challenge_entry_points",
      "award_poll_vote_points",
      "award_member_action_points",
    ]) {
      const body = fnBody(name);
      assert.match(body, /source_ref, community_id, note\)/, name);
      assert.match(body, /bump_membership_points\(new\.member_id, v_community/, name);
    }
  });

  it("upsert_notification takes and stores a community", () => {
    assert.match(code, /drop function if exists public\.upsert_notification\(uuid, text, text, text, text, text, text\);/);
    const body = fnBody("upsert_notification");
    assert.match(body, /p_community_id text default null/);
    assert.match(body, /dedup_key, community_id\)/);
    assert.match(
      code,
      /revoke execute on function public\.upsert_notification\(uuid, text, text, text, text, text, text, text\)\s+from public, anon, authenticated;/,
    );
  });

  it("redeem_reward has no fallback brand and fixed copy", () => {
    const body = fnBody("redeem_reward");
    assert.doesNotMatch(body, /coalesce\(v_reward\.community_id/);
    assert.match(body, /raise exception 'Reward has no brand'/);
    assert.match(body, /The brand will fulfill it soon\./);
    assert.doesNotMatch(body, /An brand/);
    assert.match(body, /auth\.uid\(\) is distinct from p_member_id/);
    assert.match(
      code,
      /revoke execute on function public\.redeem_reward\(uuid, uuid, text\) from public, anon;/,
    );
  });

  it("fills a missing community on insert for all 13 tables", () => {
    const body = fnBody("fill_community_id");
    for (const t of TABLES) assert.match(body, new RegExp(`'${t}'`), t);
    assert.match(body, /raise exception 'community_id is required on %'/);
    assert.match(code, /create trigger aa_fill_community_id before insert/);
  });

  it("refuses to finish with orphan community ids", () => {
    assert.match(code, /raise exception 'Rows with an unknown community_id remain:%'/);
  });

  it("drops the defaults and adds foreign keys on all 13 tables", () => {
    const block = code.slice(code.lastIndexOf("do $$"));
    for (const t of TABLES) assert.match(block, new RegExp(`'${t}'`), t);
    assert.match(block, /alter column community_id drop default/);
    assert.match(block, /references public\.communities\(slug\) on delete cascade/);
  });

  it("reloads the PostgREST schema", () => {
    assert.match(code, /notify pgrst, 'reload schema';\s*$/);
  });
});
