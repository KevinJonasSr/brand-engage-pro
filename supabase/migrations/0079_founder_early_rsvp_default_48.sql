-- 0079_founder_early_rsvp_default_48.sql
--
-- NOT applied yet. Numbered 0079 because 0078 is reserved by PR #118
-- (0078_rotating_checkin.sql). Renumber if needed.
--
-- Kevin approved on 2026-10-11 raising the founder early RSVP default from
-- 24 hours to 48 hours. This matches what founders were promised ("RSVP to
-- events 48 hours before everyone else").
--
-- This:
--   1. Changes the brands.founder_early_rsvp_hours column default to 48.
--   2. Changes the trigger fallback (brand row missing) to 48.
--   3. Moves brands still on the old default of 24 to 48. 0076 added the
--      column as NOT NULL with default 24, so every brand that existed
--      then has 24 stored even though nobody chose it. A brand an admin
--      set to some other number (including 0) is left alone.
--
-- Existing events are left alone. The trigger only recomputes rsvp_opens_at
-- when an event's own hours column changes, so this does not reopen or
-- re-lock any event. Only events created after this runs get 48 hours.
--
-- Mirrors frontend/lib/founder-perks.ts (FOUNDER_EARLY_RSVP_HOURS = 48,
-- MAX_FOUNDER_EARLY_RSVP_HOURS = 168). Change both.

alter table public.brands
  alter column founder_early_rsvp_hours set default 48;

comment on column public.brands.founder_early_rsvp_hours is
  'Hours founders can RSVP before everyone else. 0 turns the window off. Used for events created after this is set. Default 48.';

update public.brands
   set founder_early_rsvp_hours = 48
 where founder_early_rsvp_hours = 24;

create or replace function public.apply_founder_early_rsvp_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand_hours integer;
  v_hours integer;
  v_created timestamptz;
begin
  -- Leave current events alone unless an admin changes this event's hours.
  if tg_op = 'UPDATE'
     and new.founder_early_rsvp_hours is not distinct from old.founder_early_rsvp_hours then
    return new;
  end if;

  select b.founder_early_rsvp_hours
    into v_brand_hours
    from public.brands b
   where b.slug = new.brand_slug;

  v_hours := coalesce(new.founder_early_rsvp_hours, v_brand_hours, 48);
  if v_hours < 0 then
    v_hours := 0;
  elsif v_hours > 168 then
    v_hours := 168;
  end if;

  if v_hours = 0 then
    new.rsvp_opens_at := null;
  else
    v_created := coalesce(new.created_at, now());
    new.rsvp_opens_at := v_created + (v_hours * interval '1 hour');
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
