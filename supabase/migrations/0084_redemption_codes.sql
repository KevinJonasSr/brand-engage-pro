-- 0084_redemption_codes.sql
--
-- Short codes for counter redemption (Sprint 2, track B).
--
-- Nellie's offers tell members to "just show your member card", but a
-- reward redemption had nothing a server could read back or type in. This
-- adds a 6-character `short_code` to reward_redemptions and member_perks,
-- generated on insert by a trigger and unique per table.
--
-- Alphabet: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no 0/O/1/I), 32^6 ≈ 1.07e9
-- codes per table. Mirrors frontend/lib/redemption-code.ts.
--
-- Safe to re-run. No enum changes. Lookup is a service-role select by
-- short_code (frontend/lib/data/redemptions.ts); members read their own
-- rows through the existing self-select policies, which already cover
-- the new column.

-- ─── 1. Generator ─────────────────────────────────────────────────────────
create or replace function public.redemption_short_code(p_length int default 6)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_out text := '';
  i int;
begin
  for i in 1..greatest(p_length, 1) loop
    v_out := v_out || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  return v_out;
end;
$$;

-- ─── 2. Trigger: assign a unique code on insert ───────────────────────────
-- One function for both tables: TG_TABLE_NAME tells it where to check
-- uniqueness. The unique index is the real guard; the loop only avoids
-- the (rare) retry an insert would otherwise need.
create or replace function public.assign_redemption_short_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_code text;
  v_exists boolean;
  v_tries int := 0;
begin
  if new.short_code is not null and new.short_code <> '' then
    return new;
  end if;

  loop
    v_tries := v_tries + 1;
    v_code := public.redemption_short_code(6);
    execute format(
      'select exists (select 1 from %I.%I where short_code = $1)',
      tg_table_schema, tg_table_name
    ) into v_exists using v_code;
    exit when not v_exists;
    if v_tries > 25 then
      raise exception 'Could not allocate a unique short_code for %.%', tg_table_schema, tg_table_name;
    end if;
  end loop;

  new.short_code := v_code;
  return new;
end;
$$;

-- ─── 3. reward_redemptions ────────────────────────────────────────────────
alter table public.reward_redemptions
  add column if not exists short_code text;

create unique index if not exists reward_redemptions_short_code_key
  on public.reward_redemptions (short_code);

drop trigger if exists reward_redemptions_short_code on public.reward_redemptions;
create trigger reward_redemptions_short_code
  before insert on public.reward_redemptions
  for each row execute function public.assign_redemption_short_code();

-- Backfill rows that predate this migration. Row-by-row so each code is
-- checked against the ones already written.
do $$
declare
  r record;
  v_code text;
begin
  for r in
    select id from public.reward_redemptions
    where short_code is null or short_code = ''
    order by created_at
  loop
    loop
      v_code := public.redemption_short_code(6);
      exit when not exists (
        select 1 from public.reward_redemptions where short_code = v_code
      );
    end loop;
    update public.reward_redemptions set short_code = v_code where id = r.id;
  end loop;
end $$;

-- ─── 4. member_perks (only where the table exists) ────────────────────────
do $$
begin
  if to_regclass('public.member_perks') is null then
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'member_perks'
      and column_name = 'short_code'
  ) then
    alter table public.member_perks add column short_code text;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'member_perks'
      and indexname = 'member_perks_short_code_key'
  ) then
    create unique index member_perks_short_code_key
      on public.member_perks (short_code);
  end if;

  drop trigger if exists member_perks_short_code on public.member_perks;
  create trigger member_perks_short_code
    before insert on public.member_perks
    for each row execute function public.assign_redemption_short_code();
end $$;

do $$
declare
  r record;
  v_code text;
begin
  if to_regclass('public.member_perks') is null then
    return;
  end if;

  for r in
    select id from public.member_perks
    where short_code is null or short_code = ''
    order by granted_at
  loop
    loop
      v_code := public.redemption_short_code(6);
      exit when not exists (
        select 1 from public.member_perks where short_code = v_code
      );
    end loop;
    update public.member_perks set short_code = v_code where id = r.id;
  end loop;
end $$;

-- ─── 5. Grants ────────────────────────────────────────────────────────────
-- The trigger runs as the inserting role, so every role that can insert
-- into either table must be able to call the helpers.
revoke execute on function public.redemption_short_code(int) from public;
revoke execute on function public.assign_redemption_short_code() from public;
grant execute on function public.redemption_short_code(int) to authenticated, service_role;
grant execute on function public.assign_redemption_short_code() to authenticated, service_role;

comment on column public.reward_redemptions.short_code is
  '6-char counter code (no 0/O/1/I). Assigned by trigger on insert; shown in /me/redemptions and looked up at /admin/redemptions/[code].';
