-- 0068_lock_birthday_month.sql
--
-- Brand Engage: once a member's birthday month is set, the member cannot
-- change it. The birthday month gates the Nellie's birthday entree, so a
-- member who could move it every few weeks could claim the entree more
-- than once a year across different months.
--
-- PR #66 already locks it in the app (/me/birthday only writes while the
-- column is null). But 0058 grants authenticated update on birthday_month
-- and allowlists it in members_reject_integrity_column_updates(), so a
-- direct PostgREST call with the member's own JWT could still change it.
-- This trigger closes that hole in the database.
--
-- Rules:
--   * authenticated and anon may set it from null to 1-12 (first set).
--   * authenticated and anon may not change or clear a month once set.
--     Writing the same value again is allowed (no change).
--   * Every other role (service_role, postgres, SECURITY DEFINER code) is
--     not touched, so support can still fix a wrong month.
--
-- The 0058 column grant and allowlist stay as they are. The trigger
-- function is SECURITY INVOKER, so current_user is the caller's role.

create or replace function public.members_lock_birthday_month()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if old.birthday_month is not null
     and new.birthday_month is distinct from old.birthday_month then
    raise exception 'Birthday month is already set and cannot be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.members_lock_birthday_month() is
  'Blocks authenticated/anon from changing or clearing members.birthday_month once set. Privileged roles bypass for support fixes.';

revoke all on function public.members_lock_birthday_month() from public, anon, authenticated;

drop trigger if exists members_lock_birthday_month on public.members;
create trigger members_lock_birthday_month
  before update of birthday_month on public.members
  for each row execute function public.members_lock_birthday_month();
