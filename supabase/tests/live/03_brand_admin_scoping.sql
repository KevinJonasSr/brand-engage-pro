-- 03_brand_admin_scoping.sql
--
-- Live check that a brand admin scoped to one brand (admin_users row for
-- 'nellies') cannot see or change another brand's data through RLS:
-- specials, reward redemptions, and admin_users itself. It also reports
-- whether a scoped admin can reach fraud_signals, which today's policy
-- (fraud_signals_super_admin_all) allows for ANY admin, not only '*' admins.
--
-- Everything runs in one transaction that ends in ROLLBACK, so nothing is
-- kept and no network events are sent.
--
-- Run (see README.md for the safety checklist first):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/live/03_brand_admin_scoping.sql

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

-- Runs a statement as the scoped admin and returns the error message, or
-- null when it succeeded. The subtransaction undoes the role switch.
create function pg_temp.admin_error(sql text) returns text
language plpgsql as $$
begin
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', current_setting('bep_test.admin'), 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    execute sql;
    raise exception using errcode = 'P0001', message = '__no_error__';
  exception when others then
    if sqlerrm = '__no_error__' then
      return null;
    end if;
    return sqlerrm;
  end;
end $$;

-- Runs a statement as the scoped admin and returns how many rows it
-- touched (or the count, for a "select count(*)"). Changes are kept until
-- the final ROLLBACK.
create function pg_temp.admin_rows(sql text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('bep_test.admin'), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  if sql ilike 'select%' then
    execute sql into n;
  else
    execute sql;
    get diagnostics n = row_count;
  end if;
  execute 'reset role';
  return n;
end $$;

-- ---------------------------------------------------------------- fixtures
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_special_own uuid;
  v_special_other uuid;
  v_reward_own uuid;
  v_reward_other uuid;
  v_red_own uuid;
  v_red_other uuid;
begin
  insert into auth.users (id, email, aud, role)
  values (v_admin, 'live-test+' || v_admin || '@example.invalid', 'authenticated', 'authenticated'),
         (v_member, 'live-test+' || v_member || '@example.invalid', 'authenticated', 'authenticated');

  insert into admin_users (user_id, community_id, role) values (v_admin, 'nellies', 'admin');

  -- Inactive, so the public read policy never shows them.
  insert into specials (brand_slug, community_id, title, active)
  values ('nellies', 'nellies', 'LIVE TEST own special', false)
  returning id into v_special_own;
  insert into specials (brand_slug, community_id, title, active)
  values ('jonas-group-ent', 'jonas-group-ent', 'LIVE TEST other special', false)
  returning id into v_special_other;

  insert into rewards_catalog (community_id, title, point_cost, kind, active)
  values ('nellies', 'LIVE TEST own reward', 1, 'custom', false)
  returning id into v_reward_own;
  insert into rewards_catalog (community_id, title, point_cost, kind, active)
  values ('jonas-group-ent', 'LIVE TEST other reward', 1, 'custom', false)
  returning id into v_reward_other;

  insert into reward_redemptions (member_id, reward_id, community_id, point_cost)
  values (v_member, v_reward_own, 'nellies', 1)
  returning id into v_red_own;
  insert into reward_redemptions (member_id, reward_id, community_id, point_cost)
  values (v_member, v_reward_other, 'jonas-group-ent', 1)
  returning id into v_red_other;

  insert into fraud_signals (member_id, verdict) values (v_member, 'unclear');

  perform set_config('bep_test.admin', v_admin::text, true);
  perform set_config('bep_test.member', v_member::text, true);
  perform set_config('bep_test.special_own', v_special_own::text, true);
  perform set_config('bep_test.special_other', v_special_other::text, true);
  perform set_config('bep_test.red_own', v_red_own::text, true);
  perform set_config('bep_test.red_other', v_red_other::text, true);
end $$;

-- ------------------------------------------------------------------ checks
do $$
declare
  s_own text := current_setting('bep_test.special_own');
  s_other text := current_setting('bep_test.special_other');
  r_own text := current_setting('bep_test.red_own');
  r_other text := current_setting('bep_test.red_other');
  member text := current_setting('bep_test.member');
  admin text := current_setting('bep_test.admin');
  err text;
  n bigint;
begin
  -- Reads
  perform pg_temp.check(pg_temp.admin_rows(format(
      'select count(*) from specials where id = %L', s_own)) = 1,
    'scoped admin sees own brand special');
  perform pg_temp.check(pg_temp.admin_rows(format(
      'select count(*) from specials where id = %L', s_other)) = 0,
    'scoped admin cannot see other brand special');
  perform pg_temp.check(pg_temp.admin_rows(format(
      'select count(*) from reward_redemptions where id = %L', r_own)) = 1,
    'scoped admin sees own brand redemption');
  perform pg_temp.check(pg_temp.admin_rows(format(
      'select count(*) from reward_redemptions where id = %L', r_other)) = 0,
    'scoped admin cannot see other brand redemption');

  -- Writes to the other brand hit nothing
  perform pg_temp.check(pg_temp.admin_rows(format(
      'update specials set title = %L where id = %L', 'hijacked', s_other)) = 0,
    'scoped admin cannot update other brand special');
  perform pg_temp.check(pg_temp.admin_rows(format(
      'delete from specials where id = %L', s_other)) = 0,
    'scoped admin cannot delete other brand special');
  perform pg_temp.check((select title from specials where id = s_other::uuid) = 'LIVE TEST other special',
    'other brand special is unchanged');

  -- Positive control: the admin can still edit their own brand
  perform pg_temp.check(pg_temp.admin_rows(format(
      'update specials set title = %L where id = %L', 'LIVE TEST own special edited', s_own)) = 1,
    'scoped admin can update own brand special');

  -- Inserts into another brand are refused
  err := pg_temp.admin_error($q$insert into specials (brand_slug, community_id, title, active)
                                values ('jonas-group-ent', 'jonas-group-ent', 'LIVE TEST injected', false)$q$);
  perform pg_temp.check(err like '%row-level security%',
    'scoped admin cannot add a special to another brand');

  -- No self-promotion to super admin
  err := pg_temp.admin_error(format(
    'insert into admin_users (user_id, community_id, role) values (%L, %L, %L)', admin, '*', 'owner'));
  perform pg_temp.check(err is not null, 'scoped admin cannot add a * admin row for themselves');
  perform pg_temp.check((select count(*) from admin_users where user_id = admin::uuid) = 1,
    'admin_users still holds only the nellies row');

  -- Member-level check: the redeeming member sees their own redemptions only
  perform set_config('request.jwt.claims',
    json_build_object('sub', member, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  n := (select count(*) from reward_redemptions where id in (r_own::uuid, r_other::uuid));
  execute 'reset role';
  perform pg_temp.check(n = 2, 'member sees their own redemptions in both brands');

  -- Known finding: fraud_signals_super_admin_all admits any admin.
  n := pg_temp.admin_rows(format('select count(*) from fraud_signals where member_id = %L', member));
  if n > 0 then
    raise warning 'FINDING  scoped nellies admin can read fraud_signals for any member (policy fraud_signals_super_admin_all checks any admin_users row, not community_id = ''*'')';
  else
    raise notice 'PASS  scoped admin cannot read fraud_signals';
  end if;

  raise notice 'ALL CHECKS PASSED (rolling back)';
end $$;

rollback;
