-- Feature: visit check-in QR
-- One check-in per member per brand per calendar day (enforced by unique index).
-- Points are awarded via the API route and recorded in points_ledger.

create table public.checkins (
  id           uuid        primary key default gen_random_uuid(),
  member_id    uuid        not null references public.members(id) on delete cascade,
  brand_slug   text        not null,
  points_awarded int       not null default 25,
  created_at   timestamptz not null default now()
);

-- Unique per member+brand+day — prevents double-award even if QR is scanned twice
create unique index checkins_member_brand_day_idx
  on public.checkins (member_id, brand_slug, (created_at at time zone 'America/New_York')::date);

create index checkins_brand_recent_idx on public.checkins (brand_slug, created_at desc);

alter table public.checkins enable row level security;

create policy "Members can read own checkins"
  on public.checkins for select
  using (auth.uid() = member_id);
