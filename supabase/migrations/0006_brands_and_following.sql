-- ────────────────────────────────────────────────────────────────────────────
-- Brand Engage Pro — Phase 3a: brands CRUD + events + per-brand following
-- Safe to re-run (idempotent).
-- Apply via: Supabase dashboard → SQL Editor → paste → Run.
-- ────────────────────────────────────────────────────────────────────────────

-- ─── Brands (moves from hardcoded lib/brands.ts into Supabase) ──────────
create table if not exists public.brands (
  slug          text primary key,
  name          text not null,
  tagline       text,
  bio           text,
  hero_image    text,
  accent_from   text not null default '#7c3aed',
  accent_to     text not null default '#f97316',
  genres        text[] not null default '{}',
  social        jsonb not null default '[]'::jsonb,       -- [{label, href}]
  active        boolean not null default true,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── Brand events (upcoming shows / livestreams / listening parties) ─────
create table if not exists public.brand_events (
  id            uuid primary key default gen_random_uuid(),
  brand_slug   text not null references public.brands(slug) on delete cascade,
  title         text not null,
  detail        text,
  event_date    text,              -- free-form ("Coming soon" / "Mar 14, 2026")
  url           text,              -- ticket / livestream link
  sort_order    smallint not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists brand_events_brand_idx
  on public.brand_events (brand_slug, active, sort_order);

-- ─── Member → brand following (per-brand audience segmentation) ────────────
create table if not exists public.member_brand_following (
  member_id        uuid not null references public.members(id) on delete cascade,
  brand_slug   text not null references public.brands(slug) on delete cascade,
  followed_at   timestamptz not null default now(),
  primary key (member_id, brand_slug)
);

create index if not exists member_brand_following_brand_idx
  on public.member_brand_following (brand_slug);

-- ─── Updated-at trigger for brands ───────────────────────────────────────
drop trigger if exists brands_set_updated_at on public.brands;
create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

-- ─── Seed brands from hardcoded data (upsert; safe to re-run) ────────────
insert into public.brands (slug, name, tagline, bio, accent_from, accent_to, genres, social, sort_order) values
  ('raelynn', 'RaeLynn', 'Country, heart-first.',             'Placeholder bio — awaiting final copy from marketing.', '#f43f5e', '#fbbf24', '{"Country","Americana"}', '[{"label":"Instagram","href":"https://instagram.com/raelynn"}]'::jsonb, 1),
  ('bailee',  'Bailee',  'Rising voice, no ceiling.',         'Placeholder bio — awaiting assets from Box drop.',       '#8b5cf6', '#e879f9', '{"Pop"}',                 '[]'::jsonb, 2),
  ('blake',   'Blake',   'Studio-raw, stadium-ready.',        'Placeholder bio — awaiting assets from Box drop.',       '#0ea5e9', '#34d399', '{"Country","Rock"}',      '[]'::jsonb, 3),
  ('konnor',  'Konnor',  'New-school songwriting.',           'Placeholder bio — awaiting assets from Box drop.',       '#f59e0b', '#fb923c', '{"Pop","Indie"}',         '[]'::jsonb, 4),
  ('dan',     'Dan',     'Heartland heart, modern punch.',    'Placeholder bio — awaiting assets from Box drop.',       '#64748b', '#60a5fa', '{"Country"}',             '[]'::jsonb, 5)
on conflict (slug) do update set
  name        = excluded.name,
  tagline     = coalesce(brands.tagline, excluded.tagline),
  bio         = coalesce(brands.bio,     excluded.bio),
  accent_from = excluded.accent_from,
  accent_to   = excluded.accent_to,
  genres      = excluded.genres,
  social      = excluded.social,
  sort_order  = excluded.sort_order;

-- Seed one placeholder event per brand (only if they have zero events yet)
insert into public.brand_events (brand_slug, title, detail, event_date, sort_order)
select a.slug, 'TBD', 'Dates to come', '—', 0
from public.brands a
where not exists (
  select 1 from public.brand_events e where e.brand_slug = a.slug
);

-- Upsert the RaeLynn listening-party entry specifically
insert into public.brand_events (brand_slug, title, detail, event_date, sort_order)
select 'raelynn', 'Nashville Listening Party', 'Brand Engage Pro members only', 'Coming soon', 1
where exists (select 1 from public.brands where slug = 'raelynn')
  and not exists (
    select 1 from public.brand_events
    where brand_slug = 'raelynn' and title = 'Nashville Listening Party'
  );

-- ─── Row Level Security ────────────────────────────────────────────────────
alter table public.brands              enable row level security;
alter table public.brand_events        enable row level security;
alter table public.member_brand_following enable row level security;

-- Public read for brands + events (anyone can browse brand pages)
drop policy if exists brands_public_read on public.brands;
create policy brands_public_read on public.brands
  for select using (active = true);

drop policy if exists brand_events_public_read on public.brand_events;
create policy brand_events_public_read on public.brand_events
  for select using (active = true);

-- Writes to brands + events happen via admin service role (bypasses RLS)

-- Following: members manage only their own rows
drop policy if exists member_brand_following_select_own on public.member_brand_following;
create policy member_brand_following_select_own on public.member_brand_following
  for select using (auth.uid() = member_id);

drop policy if exists member_brand_following_insert_own on public.member_brand_following;
create policy member_brand_following_insert_own on public.member_brand_following
  for insert with check (auth.uid() = member_id);

drop policy if exists member_brand_following_delete_own on public.member_brand_following;
create policy member_brand_following_delete_own on public.member_brand_following
  for delete using (auth.uid() = member_id);

-- ─── Smoke-test queries ────────────────────────────────────────────────────
-- select slug, name, sort_order from brands order by sort_order;
-- select brand_slug, title from brand_events order by brand_slug, sort_order;
