-- ============================================================================
-- 0052_nellies_jackie_launch_perks.sql
-- ============================================================================
-- Jackie launch for Nellie's Southern Kitchen (community_id / brand_slug
-- 'nellies'). Idempotent. Prefer unpublish over delete.
--
-- Jackie's three are REAL RULES — do not flip 1-pt catalog rows active:
--   1. Welcome dessert with entrée — granted on Nellie's membership create
--   2. 1,500 bonus points — awarded on the 3rd verified check-in
--   3. Birthday entrée up to $30 — redeemable in birthday month (persist
--      members.birthday_month)
--
-- Keep: Bourbon & Cigar Night — Private Dining Room (NOT Rooftop),
-- September 23, 2026, 7:00pm America/New_York, cap 40.
-- Set event_date AND event_starts_at (and starts_at) so the date shows.
--
-- APPLY on BEP Supabase project enfpviapxvqyoarwwsuf (SQL Editor → Run)
-- AFTER 0051. Does not change redeem_reward caller bind / member
-- self-update integrity except adding birthday_month to the allowlist.
-- ============================================================================

-- ─── 0. event_starts_at alias (live guest CS / latest-strip read this) ───
alter table public.brand_events
  add column if not exists event_starts_at timestamptz;

update public.brand_events
   set event_starts_at = starts_at
 where event_starts_at is null
   and starts_at is not null;

-- ─── 1. Birthday month on members ────────────────────────────────────────
alter table public.members
  add column if not exists birthday_month smallint;

do $$ begin
  alter table public.members
    add constraint members_birthday_month_chk
    check (birthday_month is null or birthday_month between 1 and 12);
exception when duplicate_object then null; end $$;

comment on column public.members.birthday_month is
  '1–12. Gates Nellie''s birthday entrée (Jackie launch). Null until the member sets it.';

-- Extend 0051 allowlist so members can persist birthday_month themselves.
revoke update on table public.members from authenticated;

do $$
declare
  allowed text[] := array[
    'first_name',
    'last_name',
    'city',
    'phone',
    'handle',
    'favorite_brand',
    'interest',
    'sms_opted_in',
    'email_opted_in',
    'avatar_url',
    'socials',
    'public_profile_enabled',
    'consent_accepted_at',
    'consent_version',
    'birthday_month'
  ];
  existing text[];
begin
  select coalesce(array_agg(a.attname order by a.attname), '{}')
    into existing
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'members'
    and a.attnum > 0
    and not a.attisdropped
    and a.attname = any (allowed);

  if existing = '{}' then
    raise exception '0052: no allowed members columns found to GRANT UPDATE';
  end if;

  execute format(
    'grant update (%s) on table public.members to authenticated',
    (select string_agg(format('%I', x), ', ') from unnest(existing) as x)
  );
end $$;

create or replace function public.members_reject_integrity_column_updates()
returns trigger
language plpgsql
as $$
declare
  allowed constant text[] := array[
    'first_name',
    'last_name',
    'city',
    'phone',
    'handle',
    'favorite_brand',
    'interest',
    'sms_opted_in',
    'email_opted_in',
    'avatar_url',
    'socials',
    'public_profile_enabled',
    'consent_accepted_at',
    'consent_version',
    'birthday_month',
    'updated_at'
  ];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Updating protected member fields is not allowed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ─── 2. member_perks (welcome grant + birthday redeem; not catalog SKUs) ─
create table if not exists public.member_perks (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members(id) on delete cascade,
  community_id  text not null,
  perk_slug     text not null,
  source_ref    text not null unique,
  granted_at    timestamptz not null default now(),
  redeemed_at   timestamptz
);

create index if not exists member_perks_member_idx
  on public.member_perks (member_id, community_id, perk_slug);

alter table public.member_perks enable row level security;

drop policy if exists member_perks_self_select on public.member_perks;
create policy member_perks_self_select on public.member_perks
  for select using (auth.uid() = member_id);

grant select on public.member_perks to authenticated, anon;
grant all on public.member_perks to service_role;

-- Welcome dessert: granted on Nellie's membership create (join).
create or replace function public.grant_nellies_welcome_dessert(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.member_perks (
    member_id, community_id, perk_slug, source_ref
  ) values (
    p_member_id,
    'nellies',
    'nsk-welcome-dessert',
    'nellies:welcome-dessert:' || p_member_id::text
  )
  on conflict (source_ref) do nothing;
end;
$$;

create or replace function public.nellies_welcome_on_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.community_id = 'nellies' and new.status = 'active' then
    perform public.grant_nellies_welcome_dessert(new.member_id);
  end if;
  return new;
end;
$$;

drop trigger if exists nellies_welcome_on_membership on public.member_community_memberships;
create trigger nellies_welcome_on_membership
  after insert or update of status on public.member_community_memberships
  for each row execute function public.nellies_welcome_on_membership();

revoke all on function public.grant_nellies_welcome_dessert(uuid) from public;
grant execute on function public.grant_nellies_welcome_dessert(uuid) to service_role;

-- Birthday entrée: redeemable only in the member's birthday month. Not 1-pt.
create or replace function public.redeem_nellies_birthday_entree()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := auth.uid();
  v_month int;
  v_year int;
  v_ref text;
  v_id uuid;
begin
  if auth.role() = 'anon' or v_member_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select birthday_month into v_month from public.members where id = v_member_id;
  if v_month is null then
    raise exception 'Set your birthday month to redeem the birthday entrée';
  end if;

  v_year := extract(year from timezone('America/New_York', now()))::int;
  if extract(month from timezone('America/New_York', now()))::int is distinct from v_month then
    raise exception 'Birthday entrée is only redeemable during your birthday month';
  end if;

  v_ref := 'nellies:birthday-entree:' || v_member_id::text || ':' || v_year::text;

  insert into public.member_perks (
    member_id, community_id, perk_slug, source_ref, redeemed_at
  ) values (
    v_member_id,
    'nellies',
    'nsk-birthday-entree',
    v_ref,
    now()
  )
  on conflict (source_ref) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.member_perks where source_ref = v_ref;
    raise exception 'Birthday entrée already redeemed this year';
  end if;

  return v_id;
end;
$$;

revoke all on function public.redeem_nellies_birthday_entree() from public;
revoke all on function public.redeem_nellies_birthday_entree() from anon;
grant execute on function public.redeem_nellies_birthday_entree() to authenticated;
grant execute on function public.redeem_nellies_birthday_entree() to service_role;

-- 3-visit 1,500 pts: awarded on the 3rd verified Nellie's check-in.
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

  perform public.bump_membership_points(new.member_id, 'nellies', 1500);

  return new;
end;
$$;

drop trigger if exists award_nellies_three_visit_bonus on public.checkins;
create trigger award_nellies_three_visit_bonus
  after insert on public.checkins
  for each row execute function public.award_nellies_three_visit_bonus();

-- ─── 3. Bourbon & Cigar Night — Private Dining Room, Sept 23 2026 7pm ET ─
update public.brand_events
   set active = true,
       title = 'Bourbon & Cigar Night',
       event_date = 'Wednesday, September 23 · 7:00 PM ET',
       starts_at = timestamptz '2026-09-23 19:00:00 America/New_York',
       event_starts_at = timestamptz '2026-09-23 19:00:00 America/New_York',
       ends_at = timestamptz '2026-09-23 22:00:00 America/New_York',
       location = 'Nellie''s Southern Kitchen — Private Dining Room',
       capacity = 40,
       detail = 'Premium bourbon pours and hand-selected cigars. Members welcome.',
       brand_slug = coalesce(nullif(brand_slug, ''), 'nellies'),
       community_id = coalesce(nullif(community_id, ''), 'nellies')
 where (community_id = 'nellies' or brand_slug = 'nellies')
   and title ilike '%bourbon%cigar%';

insert into public.brand_events (
  brand_slug, community_id, title, detail, event_date, location,
  starts_at, event_starts_at, ends_at, capacity, sort_order, active, tier
)
select
  'nellies',
  'nellies',
  'Bourbon & Cigar Night',
  'Premium bourbon pours and hand-selected cigars. Members welcome.',
  'Wednesday, September 23 · 7:00 PM ET',
  'Nellie''s Southern Kitchen — Private Dining Room',
  timestamptz '2026-09-23 19:00:00 America/New_York',
  timestamptz '2026-09-23 19:00:00 America/New_York',
  timestamptz '2026-09-23 22:00:00 America/New_York',
  40,
  1,
  true,
  'public'
where not exists (
  select 1 from public.brand_events
   where (community_id = 'nellies' or brand_slug = 'nellies')
     and title ilike '%bourbon%cigar%'
);

-- If duplicate Bourbon rows exist, keep the earliest and unpublish extras.
with ranked as (
  select id, row_number() over (order by created_at, id) as rn
    from public.brand_events
   where (community_id = 'nellies' or brand_slug = 'nellies')
     and title ilike '%bourbon%cigar%'
)
update public.brand_events e
   set active = false
  from ranked r
 where e.id = r.id
   and r.rn > 1;

-- ─── 4. Unpublish extras (do not delete) ─────────────────────────────────
-- Hana signed-out leaks: premium/founder teasers (Hallway, LIVEBOOTH)
-- plus 0048 rooftop recurrences (Del Webb HH, Live Music Thu/Fri).
update public.specials
   set active = false
 where (community_id = 'nellies' or brand_slug = 'nellies')
   and (
     title ilike '%apron%'
     or title ilike '%hot sauce%'
     or title ilike '%fried chicken%'
     or title ilike '%biscuit%'
     or title ilike '%hallway%'
     or title ilike '%reserved booth%'
     or redemption_code in ('LIVEBOOTH', 'HALLWAYTOUR')
     or title ilike '%happy hour%'
     or title ilike '%music row%'
     or title ilike '%complimentary dessert%'
     or title ilike '%complimentary app%'
     or title ilike '%seasonal menu%'
     or title ilike '%rooftop%'
     or title ilike '%del webb%'
   )
   and active = true;

update public.brand_events
   set active = false
 where (community_id = 'nellies' or brand_slug = 'nellies')
   and title not ilike '%bourbon%cigar%'
   and active = true;

-- Named 0048 rooftop rows (in case brand_slug was unset on insert).
update public.brand_events
   set active = false
 where active = true
   and title not ilike '%bourbon%cigar%'
   and (
     title ilike 'Del Webb Rooftop Happy Hour'
     or title ilike 'Live Music — Rooftop (Thursday)'
     or title ilike 'Live Music — Rooftop (Friday)'
     or title ilike 'Live Music - Rooftop (Thursday)'
     or title ilike 'Live Music - Rooftop (Friday)'
     or title ilike '%rooftop%karaoke%'
     or (title ilike '%live music%' and title ilike '%rooftop%')
     or title ilike '%del webb%'
   );

-- Music Row House Tour lives on jonas-group-ent; hide per Data list.
update public.specials
   set active = false
 where title ilike '%music row house tour%'
   and active = true;

update public.brand_events
   set active = false
 where title ilike '%music row house tour%'
   and active = true;

-- Catalog + offers: keep Jackie 1-pt SKUs UNPUBLISHED. Hide merch extras.
update public.rewards_catalog
   set active = false,
       updated_at = now()
 where community_id = 'nellies'
   and active = true;

update public.offers
   set active = false
 where community_id = 'nellies'
   and active = true;

-- ─── Verify (run after apply; do not invent probe users) ─────────────────
-- select title, event_date, event_starts_at, starts_at, location, capacity, active
--   from brand_events
--  where title ilike '%bourbon%cigar%';
-- select title, active from specials where brand_slug = 'nellies';
-- select title, point_cost, active from rewards_catalog where community_id = 'nellies';
-- select slug, title, active from offers where community_id = 'nellies';
