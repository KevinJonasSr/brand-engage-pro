-- ────────────────────────────────────────────────────────────────────────────
-- Brand Engage Pro — Phase 3b: event RSVPs + capacity + per-event campaigns
-- Safe to re-run (idempotent).
-- Apply via: Supabase dashboard → SQL Editor → paste → Run.
-- ────────────────────────────────────────────────────────────────────────────

-- ─── Expand brand_events with real event metadata ─────────────────────────
alter table public.brand_events
  add column if not exists capacity    integer,
  add column if not exists starts_at   timestamptz,
  add column if not exists ends_at     timestamptz,
  add column if not exists location    text,
  add column if not exists image_url   text;

create index if not exists brand_events_starts_at_idx
  on public.brand_events (starts_at);

-- ─── event_rsvps (one row per member per event) ───────────────────────────────
create table if not exists public.event_rsvps (
  event_id   uuid not null references public.brand_events(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  rsvp_at    timestamptz not null default now(),
  primary key (event_id, member_id)
);

create index if not exists event_rsvps_member_idx on public.event_rsvps (member_id, rsvp_at desc);
create index if not exists event_rsvps_event_idx on public.event_rsvps (event_id);

-- ─── Points on RSVP (+10 pts, idempotent via source_ref guard) ────────────
create or replace function public.award_event_rsvp_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  award int := 10;
  ref_id text := 'event_rsvp:' || new.event_id::text || ':' || new.member_id::text;
begin
  if not exists (select 1 from points_ledger where source_ref = ref_id) then
    insert into points_ledger (member_id, delta, source, source_ref, note)
    values (new.member_id, award, 'event_rsvp', ref_id, 'RSVPed to event');

    update members
      set total_points = coalesce(total_points, 0) + award
    where id = new.member_id;
  end if;
  return new;
end $$;

drop trigger if exists event_rsvps_award_points on public.event_rsvps;
create trigger event_rsvps_award_points
  after insert on public.event_rsvps
  for each row execute function public.award_event_rsvp_points();

-- ─── Capacity enforcement (block RSVP when full) ──────────────────────────
create or replace function public.enforce_event_capacity()
returns trigger language plpgsql as $$
declare
  v_capacity integer;
  v_current  integer;
begin
  select capacity into v_capacity from brand_events where id = new.event_id;
  if v_capacity is null then return new; end if;  -- unlimited

  select count(*) into v_current from event_rsvps where event_id = new.event_id;
  if v_current >= v_capacity then
    raise exception 'Event is at capacity';
  end if;
  return new;
end $$;

drop trigger if exists event_rsvps_enforce_capacity on public.event_rsvps;
create trigger event_rsvps_enforce_capacity
  before insert on public.event_rsvps
  for each row execute function public.enforce_event_capacity();

-- ─── Row Level Security ────────────────────────────────────────────────────
alter table public.event_rsvps enable row level security;

-- Member can read own RSVPs
drop policy if exists event_rsvps_select_own on public.event_rsvps;
create policy event_rsvps_select_own on public.event_rsvps
  for select using (auth.uid() = member_id);

-- Aggregate counts are public — but since the table has member_id in it, we
-- expose a view instead of a separate public policy. Counts are fetched
-- via service-role admin client.

-- Member can insert own RSVP
drop policy if exists event_rsvps_insert_own on public.event_rsvps;
create policy event_rsvps_insert_own on public.event_rsvps
  for insert with check (auth.uid() = member_id);

-- Member can delete (un-RSVP) own row
drop policy if exists event_rsvps_delete_own on public.event_rsvps;
create policy event_rsvps_delete_own on public.event_rsvps
  for delete using (auth.uid() = member_id);

-- ─── Smoke test ────────────────────────────────────────────────────────────
-- select id, title, capacity, starts_at from brand_events order by sort_order;
-- select count(*) from event_rsvps;
