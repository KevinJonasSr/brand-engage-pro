-- 0075_gate_nellies_three_visit_bonus.sql
--
-- NOT applied by this change. The owner runs it on BEP project
-- enfpviapxvqyoarwwsuf after merge. Do not apply it to production
-- from the app or from CI.
--
-- Nellie's "1,500 Bonus Points" (rewards_catalog id
-- 064a11f6-7508-4104-beb5-25cef405e9f7) was paused by setting that
-- catalog row inactive. The award does not go through redeem_reward.
-- award_nellies_three_visit_bonus (0052, recreated in 0056) fires
-- after every Nellie's check-in and, on the third visit, inserts a
-- 1,500 point ledger row with source_ref 'nellies-3-visit:<member>'
-- whether or not the catalog row is active. The brand page was also
-- seeding that offer in the app, so turning the catalog row off did
-- not hide it.
--
-- This keeps the function and the trigger. It returns before paying
-- when that catalog row is missing or inactive. Setting active = true
-- on the same row turns the award back on for a later check-in (still
-- once per member, still only at 3 or more Nellie's check-ins).
-- Existing ledger rows are left alone. Ordinary visit points
-- (daily_checkin, 25) are written by the app, not by this trigger.

create or replace function public.award_nellies_three_visit_bonus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_ref text := 'nellies-3-visit:' || new.member_id::text;
begin
  if new.brand_slug is distinct from 'nellies' then
    return new;
  end if;

  -- Same switch the owner already flipped. Missing row counts as off.
  if not exists (
    select 1
      from public.rewards_catalog
     where id = '064a11f6-7508-4104-beb5-25cef405e9f7'
       and active
  ) then
    return new;
  end if;

  select count(*)::int into v_count
    from public.checkins
   where member_id = new.member_id
     and brand_slug = 'nellies';

  if v_count < 3 then
    return new;
  end if;

  if exists (select 1 from public.points_ledger where source_ref = v_ref) then
    return new;
  end if;

  insert into public.points_ledger (member_id, delta, source, source_ref, community_id, note)
  values (
    new.member_id,
    1500,
    'challenge',
    v_ref,
    'nellies',
    '1,500 bonus points (3-visit)'
  );

  update public.members
     set total_points = coalesce(total_points, 0) + 1500
   where id = new.member_id;

  if to_regprocedure('public.bump_membership_points(uuid, text, integer)') is not null then
    perform public.bump_membership_points(new.member_id, 'nellies', 1500);
  end if;

  return new;
end;
$$;

-- Signature is unchanged, so the 0056 trigger still calls this function.
-- Recreate it so a database that lost the trigger picks the gated body up.
drop trigger if exists award_nellies_three_visit_bonus on public.checkins;
create trigger award_nellies_three_visit_bonus
  after insert on public.checkins
  for each row execute function public.award_nellies_three_visit_bonus();

revoke all on function public.award_nellies_three_visit_bonus() from public;
revoke all on function public.award_nellies_three_visit_bonus() from anon, authenticated;
grant execute on function public.award_nellies_three_visit_bonus() to service_role;

-- Smoke check (do not run against production as a data change; wrap in
-- begin/rollback on a scratch database). With the catalog row inactive:
--   * a third Nellie's check-in writes no points_ledger row whose
--     source_ref is 'nellies-3-visit:' || member_id
--   * a daily_checkin ledger row of +25 for that visit is unchanged
-- With the catalog row active, the next Nellie's check-in at count >= 3
-- still inserts the 1,500 row once.
