-- 01_redemption_cancel_refund.sql
--
-- Live check of redeem_reward (0062) and cancel_redemption (0060):
-- points come off and go back, stock comes off and goes back, exactly one
-- spend row and one refund row land in points_ledger under the reward's
-- brand, and the guard rails hold.
--
-- Everything runs in one transaction that ends in ROLLBACK, so nothing is
-- kept. pg_net only sends after commit, so the network_publish triggers
-- send nothing either.
--
-- Run (see README.md for the safety checklist first):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/live/01_redemption_cancel_refund.sql
--
-- Output: one NOTICE per check. The first failed check raises an error,
-- psql stops, and the transaction is thrown away.

\set ON_ERROR_STOP 1

begin;

create function pg_temp.check(ok boolean, label text) returns void
language plpgsql as $$
begin
  if ok is true then
    raise notice 'PASS  %', label;
  else
    raise exception 'FAIL  %', label;
  end if;
end $$;

-- Runs a statement as the given role and member and returns the error
-- message, or null when it succeeded. The subtransaction undoes both the
-- statement and the role switch.
create function pg_temp.error_of(sql text, as_role text, as_member uuid) returns text
language plpgsql as $$
begin
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', as_member, 'role', as_role)::text, true);
    execute format('set local role %I', as_role);
    execute sql;
    raise exception using errcode = 'P0001', message = '__no_error__';
  exception when others then
    if sqlerrm = '__no_error__' then
      return null;
    end if;
    return sqlerrm;
  end;
end $$;

-- ---------------------------------------------------------------- fixtures
do $$
declare
  v_member uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_reward uuid;
  v_pricey uuid;
begin
  -- handle_new_auth_user creates the members row for each.
  insert into auth.users (id, email, aud, role)
  values (v_member, 'live-test+' || v_member || '@example.invalid', 'authenticated', 'authenticated'),
         (v_other, 'live-test+' || v_other || '@example.invalid', 'authenticated', 'authenticated');

  insert into member_community_memberships (member_id, community_id)
  values (v_member, 'nellies');

  update members set total_points = 500 where id = v_member;
  update member_community_memberships set total_points = 500
   where member_id = v_member and community_id = 'nellies';

  insert into rewards_catalog (community_id, title, point_cost, kind, stock, active)
  values ('nellies', 'LIVE TEST reward', 100, 'custom', 2, true)
  returning id into v_reward;

  insert into rewards_catalog (community_id, title, point_cost, kind, stock, active)
  values ('nellies', 'LIVE TEST pricey reward', 100000, 'custom', null, true)
  returning id into v_pricey;

  perform set_config('bep_test.member', v_member::text, true);
  perform set_config('bep_test.other', v_other::text, true);
  perform set_config('bep_test.reward', v_reward::text, true);
  perform set_config('bep_test.pricey', v_pricey::text, true);
end $$;

-- ------------------------------------------------ redeem as the member
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bep_test.member'), 'role', 'authenticated')::text, true);
select set_config('bep_test.redemption',
  public.redeem_reward(
    current_setting('bep_test.member')::uuid,
    current_setting('bep_test.reward')::uuid,
    'live test'
  )::text, true);
reset role;

do $$
declare
  m uuid := current_setting('bep_test.member')::uuid;
  r uuid := current_setting('bep_test.reward')::uuid;
  d uuid := current_setting('bep_test.redemption')::uuid;
begin
  perform pg_temp.check((select total_points from members where id = m) = 400,
    'redeem: members.total_points 500 -> 400');
  perform pg_temp.check((select total_points from member_community_memberships
                          where member_id = m and community_id = 'nellies') = 400,
    'redeem: nellies membership total 500 -> 400');
  perform pg_temp.check((select stock from rewards_catalog where id = r) = 1,
    'redeem: stock 2 -> 1');
  perform pg_temp.check((select status from reward_redemptions where id = d) = 'pending',
    'redeem: redemption is pending');
  perform pg_temp.check((select community_id from reward_redemptions where id = d) = 'nellies',
    'redeem: redemption carries the nellies brand');
  perform pg_temp.check((select count(*) from points_ledger
                          where source_ref = 'redemption:' || d
                            and delta = -100 and community_id = 'nellies'
                            and source = 'reward_redemption') = 1,
    'redeem: exactly one -100 spend row under nellies');
end $$;

-- ------------------------------------------------ cancel as service_role
set local role service_role;
select set_config('bep_test.refunded',
  public.cancel_redemption(current_setting('bep_test.redemption')::uuid, 'nellies')::text, true);
reset role;

do $$
declare
  m uuid := current_setting('bep_test.member')::uuid;
  r uuid := current_setting('bep_test.reward')::uuid;
  d uuid := current_setting('bep_test.redemption')::uuid;
begin
  perform pg_temp.check(current_setting('bep_test.refunded')::int = 100,
    'cancel: returns the stored point cost (100)');
  perform pg_temp.check((select total_points from members where id = m) = 500,
    'cancel: members.total_points back to 500');
  perform pg_temp.check((select total_points from member_community_memberships
                          where member_id = m and community_id = 'nellies') = 500,
    'cancel: nellies membership total back to 500');
  perform pg_temp.check((select stock from rewards_catalog where id = r) = 2,
    'cancel: stock back to 2');
  perform pg_temp.check((select status = 'cancelled' and cancelled_at is not null
                           from reward_redemptions where id = d),
    'cancel: status cancelled, cancelled_at set');
  perform pg_temp.check((select count(*) from points_ledger
                          where source_ref = 'redemption:' || d || ':refund'
                            and delta = 100 and community_id = 'nellies') = 1,
    'cancel: exactly one +100 refund row under nellies');
end $$;

-- ------------------------------------------------------------ guard rails
do $$
declare
  m uuid := current_setting('bep_test.member')::uuid;
  o uuid := current_setting('bep_test.other')::uuid;
  r uuid := current_setting('bep_test.reward')::uuid;
  p uuid := current_setting('bep_test.pricey')::uuid;
  d uuid := current_setting('bep_test.redemption')::uuid;
  d2 uuid;
  err text;
begin
  -- Cancelling twice must not refund twice.
  err := pg_temp.error_of(format('select public.cancel_redemption(%L)', d), 'service_role', null);
  perform pg_temp.check(err like '%Only pending redemptions can be cancelled%',
    'second cancel is refused');
  perform pg_temp.check((select total_points from members where id = m) = 500,
    'second cancel left points at 500');

  -- A member cannot redeem on someone else's behalf.
  err := pg_temp.error_of(format('select public.redeem_reward(%L, %L)', m, r), 'authenticated', o);
  perform pg_temp.check(err like '%Cannot redeem for another member%',
    'redeem for another member is refused');

  -- Anon cannot redeem at all (no execute grant, or the in-function check).
  err := pg_temp.error_of(format('select public.redeem_reward(%L, %L)', m, r), 'anon', null);
  perform pg_temp.check(err is not null, 'anon redeem is refused');

  -- Members cannot call the service-role-only functions directly.
  err := pg_temp.error_of(format('select public.cancel_redemption(%L)', d), 'authenticated', m);
  perform pg_temp.check(err like '%permission denied%',
    'authenticated cannot call cancel_redemption');
  err := pg_temp.error_of(format('select public.add_member_points(%L, 5, %L)', m, 'nellies'), 'authenticated', m);
  perform pg_temp.check(err like '%permission denied%',
    'authenticated cannot call add_member_points');

  -- Not enough points.
  err := pg_temp.error_of(format('select public.redeem_reward(%L, %L)', m, p), 'authenticated', m);
  perform pg_temp.check(err like '%Insufficient points%', 'insufficient points is refused');

  -- Second redemption for the wrong-brand and fulfilled checks.
  perform set_config('request.jwt.claims',
    json_build_object('sub', m, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  d2 := public.redeem_reward(m, r, 'live test 2');
  execute 'reset role';

  err := pg_temp.error_of(format('select public.cancel_redemption(%L, %L)', d2, 'jonas-group-ent'), 'service_role', null);
  perform pg_temp.check(err like '%Not authorized for this community%',
    'cancel with the wrong brand is refused');

  update reward_redemptions set status = 'fulfilled', fulfilled_at = now() where id = d2;
  err := pg_temp.error_of(format('select public.cancel_redemption(%L)', d2), 'service_role', null);
  perform pg_temp.check(err like '%Only pending redemptions can be cancelled%',
    'fulfilled redemption cannot be cancelled');
  perform pg_temp.check((select total_points from members where id = m) = 400,
    'fulfilled redemption kept its 100 points');

  -- Out of stock.
  update rewards_catalog set stock = 0 where id = r;
  err := pg_temp.error_of(format('select public.redeem_reward(%L, %L)', m, r), 'authenticated', m);
  perform pg_temp.check(err like '%Reward is out of stock%', 'out of stock is refused');

  -- Inactive reward.
  update rewards_catalog set stock = 5, active = false where id = r;
  err := pg_temp.error_of(format('select public.redeem_reward(%L, %L)', m, r), 'authenticated', m);
  perform pg_temp.check(err like '%Reward is no longer available%', 'inactive reward is refused');

  raise notice 'ALL CHECKS PASSED (rolling back)';
end $$;

rollback;
