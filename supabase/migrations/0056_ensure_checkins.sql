-- ============================================================================
-- 0056_ensure_checkins.sql
-- ============================================================================
-- Live www check-in fails with:
--   Could not find the table 'public.checkins' in the schema cache
--
-- 0035 created the table in-repo; prod PostgREST does not expose it
-- (never applied, dropped, or missing GRANTs so it is hidden from the
-- API schema). First-72 visit / Jackie dessert loop reads this table.
--
-- Idempotent. Safe to re-run. Reloads the PostgREST schema cache.
-- ============================================================================

create table if not exists public.checkins (
  id             uuid        primary key default gen_random_uuid(),
  member_id      uuid        not null references public.members(id) on delete cascade,
  brand_slug     text        not null,
  points_awarded int         not null default 25,
  created_at     timestamptz not null default now()
);

create unique index if not exists checkins_member_brand_day_idx
  on public.checkins (member_id, brand_slug, (created_at at time zone 'America/New_York')::date);

create index if not exists checkins_brand_recent_idx
  on public.checkins (brand_slug, created_at desc);

alter table public.checkins enable row level security;

drop policy if exists "Members can read own checkins" on public.checkins;
create policy "Members can read own checkins"
  on public.checkins for select
  using (auth.uid() = member_id);

drop policy if exists "Members can insert own checkins" on public.checkins;
create policy "Members can insert own checkins"
  on public.checkins for insert
  with check (auth.uid() = member_id);

grant usage on schema public to anon, authenticated, service_role;
grant select on table public.checkins to anon;
grant select, insert on table public.checkins to authenticated;
grant all on table public.checkins to service_role;

-- 0052 3-visit bonus trigger — recreate so a missing table does not leave
-- the Jackie / First-72 dessert loop without its check-in hook.
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

drop trigger if exists award_nellies_three_visit_bonus on public.checkins;
create trigger award_nellies_three_visit_bonus
  after insert on public.checkins
  for each row execute function public.award_nellies_three_visit_bonus();

notify pgrst, 'reload schema';
