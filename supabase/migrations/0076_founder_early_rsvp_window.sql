-- 0076_founder_early_rsvp_window.sql
--
-- NOT applied yet. Numbered 0076 because 0075 is reserved for another PR.
-- Renumber if that migration lands first.
--
-- Founder early RSVP was a fixed 48 hours (0074). Brands with a handful of
-- founders locked everyone else out, and admins could not change it.
--
-- This adds:
--   brands.founder_early_rsvp_hours       default 24, 0 disables
--   brand_events.founder_early_rsvp_hours null inherits the brand on insert
--
-- Existing events are left alone. 0074 already set their rsvp_opens_at, and
-- the trigger below only recomputes that timestamp when the per-event hours
-- column changes. Editing a title does not reopen or re-lock an event.
--
-- New events take the brand's hours (24 unless an admin changed it).
-- A per-event number, including 0, overrides the brand.
--
-- Mirrors frontend/lib/founder-perks.ts (FOUNDER_EARLY_RSVP_HOURS = 24,
-- MAX_FOUNDER_EARLY_RSVP_HOURS = 168, parseEarlyRsvpHours). Change both.

alter table public.brands
  add column if not exists founder_early_rsvp_hours integer not null default 24;

do $$
begin
  alter table public.brands
    add constraint brands_founder_early_rsvp_hours_range
    check (founder_early_rsvp_hours between 0 and 168);
exception
  when duplicate_object then null;
end $$;

comment on column public.brands.founder_early_rsvp_hours is
  'Hours founders can RSVP before everyone else. 0 turns the window off. Used for events created after this is set. Default 24.';

alter table public.brand_events
  add column if not exists founder_early_rsvp_hours integer;

do $$
begin
  alter table public.brand_events
    add constraint brand_events_founder_early_rsvp_hours_range
    check (
      founder_early_rsvp_hours is null
      or founder_early_rsvp_hours between 0 and 168
    );
exception
  when duplicate_object then null;
end $$;

comment on column public.brand_events.founder_early_rsvp_hours is
  'Per-event early RSVP hours. Null inherits the brand setting when the event is created, and leaves an existing rsvp_opens_at alone until an admin sets a number. 0 opens RSVPs immediately.';

-- The trigger owns rsvp_opens_at for new rows. now() is only a fallback if
-- the trigger is dropped, and it means "open now" rather than another 48h lock.
alter table public.brand_events
  alter column rsvp_opens_at set default now();

comment on column public.brand_events.rsvp_opens_at is
  'When RSVPs open to non-founders. Founders can RSVP any time. Null means open now. Set from the brand or event early-RSVP hours.';

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

  v_hours := coalesce(new.founder_early_rsvp_hours, v_brand_hours, 24);
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

drop trigger if exists brand_events_founder_early_rsvp on public.brand_events;
create trigger brand_events_founder_early_rsvp
  before insert or update on public.brand_events
  for each row execute function public.apply_founder_early_rsvp_window();

notify pgrst, 'reload schema';
