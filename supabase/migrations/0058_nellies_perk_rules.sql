-- 0058_nellies_perk_rules.sql
-- Brand Engage: the schema half of 0052 (Jackie launch perks) that never
-- reached production. Applied to enfpviapxvqyoarwwsuf via MCP on 2026-09-24.
--
-- State of prod before this, checked 2026-09-24:
--   already live  brand_events.event_starts_at, the 3-visit 1,500 pt bonus
--                 trigger (via 0056), Jackie's three public specials,
--                 Bourbon & Cigar Night in the PDR, 0053.
--   missing       members.birthday_month, member_perks, the welcome dessert
--                 grant, the birthday entree redeem. The app already calls
--                 all four (onboard route, /api/nellies/birthday-entree), so
--                 they were failing quietly.
--
-- Deliberately NOT carried over from 0052 (held for Kevin):
--   hiding every active Nellie's row in public.offers (18 rows that show on
--   the homepage), and the brand_events / specials data rewrites, which are
--   already in the state 0052 wanted.
--
-- Grants follow 0057: new SECURITY DEFINER functions start closed.

-- ─── 1. Birthday month on members ────────────────────────────────────────
alter table public.members
  add column if not exists birthday_month smallint;

do $$ begin
  alter table public.members
    add constraint members_birthday_month_chk
    check (birthday_month is null or birthday_month between 1 and 12);
exception when duplicate_object then null; end $$;

comment on column public.members.birthday_month is
  '1-12. Gates the Nellie''s birthday entree. Null until the member sets it.';

grant update (birthday_month) on table public.members to authenticated;

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

-- ─── 2. member_perks ─────────────────────────────────────────────────────
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
  for select to authenticated using ((select auth.uid()) = member_id);

grant select on public.member_perks to authenticated;
grant all on public.member_perks to service_role;

-- ─── 3. Welcome dessert, granted when a Nellie's membership goes active ──
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

-- ─── 4. Birthday entree, redeemable once a year in the birthday month ────
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
    v_member_id, 'nellies', 'nsk-birthday-entree', v_ref, now()
  )
  on conflict (source_ref) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'Birthday entrée already redeemed this year';
  end if;

  return v_id;
end;
$$;

-- ─── 5. Grants (0057 rules) ──────────────────────────────────────────────
revoke execute on function public.grant_nellies_welcome_dessert(uuid) from public, anon, authenticated;
revoke execute on function public.nellies_welcome_on_membership() from public, anon, authenticated;
revoke execute on function public.redeem_nellies_birthday_entree() from public, anon;
grant execute on function public.grant_nellies_welcome_dessert(uuid) to service_role;
grant execute on function public.nellies_welcome_on_membership() to service_role;
grant execute on function public.redeem_nellies_birthday_entree() to authenticated, service_role;
