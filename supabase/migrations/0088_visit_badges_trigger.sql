-- 0088_visit_badges_trigger.sql
--
-- Found in the 2026-10-29 walk-test: the visit badges seeded in 0048
-- (nsk-first-visit at 1, nsk-5-visits, nsk-10-visits, nsk-25-visits) were
-- never awarded — nothing listened to check-ins. A member who checked in
-- still saw "First Table 0/1".
--
-- Visit-count badges per brand live in a small table so any brand can add
-- its own ladder without a code change; a trigger on checkins awards every
-- rung the member has reached via award_community_badge (idempotent on
-- (member, badge, community) and on the ledger source_ref). Backfilled for
-- existing check-ins. Idempotent.

create table if not exists public.brand_visit_badges (
  brand_slug text not null references public.brands(slug) on delete cascade,
  visits     integer not null check (visits > 0),
  badge_slug text not null references public.badges(slug) on delete cascade,
  primary key (brand_slug, visits)
);

alter table public.brand_visit_badges enable row level security;
drop policy if exists brand_visit_badges_public_read on public.brand_visit_badges;
create policy brand_visit_badges_public_read
  on public.brand_visit_badges for select using (true);
grant select on public.brand_visit_badges to anon, authenticated;
grant all on public.brand_visit_badges to service_role;

insert into public.brand_visit_badges (brand_slug, visits, badge_slug) values
  ('nellies',  1, 'nsk-first-visit'),
  ('nellies',  5, 'nsk-5-visits'),
  ('nellies', 10, 'nsk-10-visits'),
  ('nellies', 25, 'nsk-25-visits')
on conflict (brand_slug, visits) do nothing;

create or replace function public.award_visit_badges(p_member_id uuid, p_brand_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visits integer;
  r record;
begin
  select count(*) into v_visits
    from public.checkins
   where member_id = p_member_id and brand_slug = p_brand_slug;

  for r in
    select badge_slug from public.brand_visit_badges
     where brand_slug = p_brand_slug and visits <= v_visits
  loop
    perform public.award_community_badge(p_member_id, r.badge_slug, p_brand_slug);
  end loop;
end $$;

revoke all on function public.award_visit_badges(uuid, text) from public, anon, authenticated;
grant execute on function public.award_visit_badges(uuid, text) to service_role;

create or replace function public.trg_award_visit_badges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_visit_badges(new.member_id, new.brand_slug);
  return new;
end $$;

drop trigger if exists checkins_award_visit_badges on public.checkins;
create trigger checkins_award_visit_badges
  after insert on public.checkins
  for each row execute function public.trg_award_visit_badges();

-- Backfill: every member/brand pair with at least one check-in.
do $$
declare r record;
begin
  for r in select distinct member_id, brand_slug from public.checkins loop
    perform public.award_visit_badges(r.member_id, r.brand_slug);
  end loop;
end $$;
