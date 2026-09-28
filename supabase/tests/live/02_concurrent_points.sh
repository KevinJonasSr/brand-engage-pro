#!/usr/bin/env bash
# 02_concurrent_points.sh
#
# Live concurrency checks. Each check starts several psql sessions at the
# same instant and then looks at the totals.
#
#   1. N parallel add_member_points(+5) calls (N = WORKERS, default 12) must
#      add exactly N*5 to the member and to the nellies membership (no lost
#      updates).
#   2. Two parallel inserts of the same ledger row (same member, brand,
#      source and source_ref) must leave exactly 1 row
#      (points_ledger_member_source_ref_unique).
#   3. Overdraft race: a member with 100 points redeems two different
#      100-point rewards at the same time. At most one may succeed and the
#      balance must never go below 0. Fails before migration 0070:
#      redeem_reward locked the reward row but not the member row, and there
#      was no total_points >= 0 check, so both succeeded and the balance hit
#      -100.
#
# Unlike 01 and 03, this script COMMITS its fixtures, because parallel
# sessions cannot see each other's uncommitted rows. That means:
#   * network_publish sends member.joined and points.awarded events to the
#     FEP hub for the test member.
#   * The two test rewards (in jonas-group, titled "LIVE TEST") are active
#     for a few seconds, so a visitor could briefly see them.
# The script deletes everything it made at the end, even when a check fails.
# Run it on a Supabase branch or local stack. Prod needs Kevin's yes.
#
# Usage:
#   DATABASE_URL=postgres://... supabase/tests/live/02_concurrent_points.sh
#   WORKERS=8 DATABASE_URL=postgres://... supabase/tests/live/02_concurrent_points.sh
#   (prod only: add BEP_LIVE_TEST_ALLOW_PROD=yes)
#
# Supabase branches cap the session pooler at 15 clients, and the script
# needs WORKERS + 2 connections at once. Past that it fails with
# EMAXCONNSESSION, so keep WORKERS at 12 or below on a branch.

set -euo pipefail

readonly FEP_REF="uhovonrljcauaoctypbg"
readonly BEP_PROD_REF="enfpviapxvqyoarwwsuf"
readonly BARRIER_KEY=4242
AWARD_WORKERS="${WORKERS:-12}"
if ! [[ "$AWARD_WORKERS" =~ ^[1-9][0-9]*$ ]]; then
  echo "WORKERS must be a positive integer." >&2
  exit 2
fi
readonly AWARD_WORKERS
readonly AWARD_POINTS=5
readonly START_POINTS=100
readonly REWARD_COST=100

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set." >&2
  exit 2
fi
if [[ "$DATABASE_URL" == *"$FEP_REF"* ]]; then
  echo "Refusing: DATABASE_URL points at Fan Engage Pro, not Brand Engage Pro." >&2
  exit 2
fi
if [[ "$DATABASE_URL" == *"$BEP_PROD_REF"* && "${BEP_LIVE_TEST_ALLOW_PROD:-}" != "yes" ]]; then
  echo "Refusing: DATABASE_URL is BEP prod. Set BEP_LIVE_TEST_ALLOW_PROD=yes only with Kevin's yes." >&2
  exit 2
fi

psql_q() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtAX "$@"
}

MEMBER_ID="$(psql_q -c "select gen_random_uuid()")"
LEDGER_REF="live-test:$(psql_q -c "select gen_random_uuid()")"
REWARD_A=""
REWARD_B=""
FAILURES=0
LOG_DIR="$(mktemp -d)"

cleanup() {
  psql_q <<SQL || echo "WARNING: cleanup failed, remove member $MEMBER_ID by hand" >&2
delete from public.reward_redemptions where member_id = '$MEMBER_ID';
delete from public.rewards_catalog where title like 'LIVE TEST race %' and community_id = 'jonas-group'
  and id in (select nullif('$REWARD_A','')::uuid union all select nullif('$REWARD_B','')::uuid);
delete from auth.users where id = '$MEMBER_ID';
SQL
  rm -rf "$LOG_DIR"
}
trap cleanup EXIT

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILURES=$((FAILURES + 1)); }

# Holds the advisory lock so every worker blocks on it, then lets them all
# go at once when it releases.
open_barrier() {
  psql_q -c "select pg_advisory_lock($BARRIER_KEY), pg_sleep(2), pg_advisory_unlock($BARRIER_KEY)" >/dev/null &
  sleep 1
}

# Runs one worker: waits at the barrier, runs $1, commits.
worker() {
  psql "$DATABASE_URL" -qtAX <<SQL
begin;
select pg_advisory_xact_lock_shared($BARRIER_KEY);
$1
commit;
SQL
}

points_of() {
  psql_q -c "select m.total_points || ' ' || coalesce(mc.total_points, -1)
               from public.members m
               left join public.member_community_memberships mc
                 on mc.member_id = m.id and mc.community_id = '$1'
              where m.id = '$MEMBER_ID'"
}

# ------------------------------------------------------------------ fixtures
echo "Creating test member $MEMBER_ID"
psql_q <<SQL >/dev/null
insert into auth.users (id, email, aud, role)
values ('$MEMBER_ID', 'live-test+$MEMBER_ID@example.invalid', 'authenticated', 'authenticated');
insert into public.member_community_memberships (member_id, community_id)
values ('$MEMBER_ID', 'nellies');
update public.members set total_points = 0 where id = '$MEMBER_ID';
update public.member_community_memberships set total_points = 0
 where member_id = '$MEMBER_ID' and community_id = 'nellies';
SQL

# ------------------------------------------------ 1. parallel point awards
open_barrier
for _ in $(seq 1 "$AWARD_WORKERS"); do
  worker "set local role service_role; select public.add_member_points('$MEMBER_ID', $AWARD_POINTS, 'nellies');" \
    >"$LOG_DIR/award.$RANDOM.log" 2>&1 &
done
wait

read -r MEMBER_TOTAL BRAND_TOTAL <<<"$(points_of nellies)"
EXPECTED=$((AWARD_WORKERS * AWARD_POINTS))
if [[ "$MEMBER_TOTAL" == "$EXPECTED" ]]; then
  pass "parallel awards: members.total_points = $EXPECTED"
else
  fail "parallel awards: members.total_points = $MEMBER_TOTAL, expected $EXPECTED"
fi
if [[ "$BRAND_TOTAL" == "$EXPECTED" ]]; then
  pass "parallel awards: nellies membership total = $EXPECTED"
else
  fail "parallel awards: nellies membership total = $BRAND_TOTAL, expected $EXPECTED"
fi

# ------------------------------------------ 2. duplicate ledger row race
LEDGER_SQL="insert into public.points_ledger (member_id, community_id, delta, source, source_ref, note)
values ('$MEMBER_ID', 'nellies', 1, 'manual_adjustment', '$LEDGER_REF', 'live test duplicate race');"
open_barrier
worker "$LEDGER_SQL" >"$LOG_DIR/ledger.1.log" 2>&1 &
worker "$LEDGER_SQL" >"$LOG_DIR/ledger.2.log" 2>&1 &
wait

LEDGER_ROWS="$(psql_q -c "select count(*) from public.points_ledger where member_id = '$MEMBER_ID' and source_ref = '$LEDGER_REF'")"
if [[ "$LEDGER_ROWS" == "1" ]]; then
  pass "duplicate ledger race: exactly 1 row"
else
  fail "duplicate ledger race: $LEDGER_ROWS rows, expected 1"
fi

# -------------------------------------------------------- 3. overdraft race
psql_q <<SQL >/dev/null
update public.members set total_points = $START_POINTS where id = '$MEMBER_ID';
insert into public.member_community_memberships (member_id, community_id, total_points)
values ('$MEMBER_ID', 'jonas-group', $START_POINTS)
on conflict (member_id, community_id) do update set total_points = excluded.total_points;
SQL
REWARD_A="$(psql_q -c "insert into public.rewards_catalog (community_id, title, point_cost, kind, active)
  values ('jonas-group', 'LIVE TEST race A', $REWARD_COST, 'custom', true) returning id")"
REWARD_B="$(psql_q -c "insert into public.rewards_catalog (community_id, title, point_cost, kind, active)
  values ('jonas-group', 'LIVE TEST race B', $REWARD_COST, 'custom', true) returning id")"

open_barrier
worker "select public.redeem_reward('$MEMBER_ID', '$REWARD_A', 'live test race');" >"$LOG_DIR/redeem.a.log" 2>&1 &
worker "select public.redeem_reward('$MEMBER_ID', '$REWARD_B', 'live test race');" >"$LOG_DIR/redeem.b.log" 2>&1 &
wait
psql_q -c "update public.rewards_catalog set active = false where id in ('$REWARD_A', '$REWARD_B')" >/dev/null

REDEEMED="$(psql_q -c "select count(*) from public.reward_redemptions where member_id = '$MEMBER_ID'")"
read -r MEMBER_TOTAL BRAND_TOTAL <<<"$(points_of jonas-group)"
if [[ "$REDEEMED" -le 1 ]]; then
  pass "overdraft race: $REDEEMED redemption(s), at most 1"
else
  fail "overdraft race: $REDEEMED redemptions succeeded on $START_POINTS points (known bug)"
fi
if [[ "$MEMBER_TOTAL" -ge 0 && "$BRAND_TOTAL" -ge 0 ]]; then
  pass "overdraft race: balances stayed at or above 0 ($MEMBER_TOTAL / $BRAND_TOTAL)"
else
  fail "overdraft race: balance went negative ($MEMBER_TOTAL member / $BRAND_TOTAL brand) (known bug)"
fi

echo
if [[ "$FAILURES" -eq 0 ]]; then
  echo "ALL CHECKS PASSED"
else
  echo "$FAILURES CHECK(S) FAILED. Worker output:"
  tail -n +1 "$LOG_DIR"/*.log
  exit 1
fi
