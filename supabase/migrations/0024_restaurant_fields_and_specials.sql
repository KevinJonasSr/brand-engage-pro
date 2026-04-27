-- ============================================================================
-- 0024_restaurant_fields_and_specials.sql
-- ============================================================================
-- Brand Engage Pro V1 schema deltas — adds the fields restaurants need on
-- the existing brands table, plus the new `specials` table for the
-- time-windowed offers that are core to the restaurant loyalty experience.
--
-- Idempotent: re-running is safe (CREATE IF NOT EXISTS, ALTER … IF NOT EXISTS,
-- CREATE OR REPLACE patterns throughout).
--
-- V1 scope: restaurants only. Other categories (retail/sports/hotel) get
-- the same brands schema; specials work for any vertical (a retail "20%
-- off Tuesdays" or a sports club "happy hour at the bar after the game"
-- both fit the same shape).
--
-- V1 deferrals (will land in later migrations):
--   * brand_locations table — one brand → many locations
--   * pos integration tables (Square / Toast / Lightspeed credentials)
--   * brand_redemptions tracking actual special claims at the register
-- ============================================================================

-- ─── 1. brand_category enum ────────────────────────────────────────────────
-- Coarse vertical classification. Drives default starter packs (rewards
-- templates per category), discovery filters on /brands, and category-
-- specific copy throughout the consumer app.
do $$ begin
  create type public.brand_category as enum ('restaurant', 'retail', 'sports', 'hotel');
exception when duplicate_object then null;
end $$;

-- ─── 2. New columns on brands ──────────────────────────────────────────────
alter table public.brands
  add column if not exists category public.brand_category not null default 'restaurant',
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists country text not null default 'US',
  add column if not exists lat numeric(9, 6),
  add column if not exists lng numeric(9, 6),
  add column if not exists hours_json jsonb,
  add column if not exists cuisine text,
  add column if not exists phone text,
  add column if not exists website_url text;

comment on column public.brands.category      is 'Vertical: restaurant, retail, sports, or hotel.';
comment on column public.brands.hours_json    is 'Day-of-week hours object, e.g. {"mon":[{"open":"11:00","close":"22:00"}], "tue":...}.';
comment on column public.brands.cuisine       is 'Subcategory within the vertical: for restaurants — southern, italian, japanese; for retail — coffee, books, lifestyle; etc. Free-form text in V1; may become its own enum once usage stabilizes.';
comment on column public.brands.lat           is 'Decimal latitude. Used by /brands discovery for "near me" sorting. Optional — brands without lat/lng are excluded from proximity queries but still listed.';
comment on column public.brands.lng           is 'Decimal longitude.';

-- Discovery index — supports "restaurants near me" with reasonable performance
-- without a full PostGIS install in V1.
create index if not exists brands_category_active_idx
  on public.brands (category, active)
  where active = true;

-- ─── 3. specials table ────────────────────────────────────────────────────
-- Time-windowed offers a brand publishes to its members. Different from
-- brand_events (which are one-shot RSVP-able happenings) because specials
-- are usually recurring (2-for-1 Tuesdays, Happy Hour 5–7) and have a
-- redemption mechanism (member shows code at the register).
create table if not exists public.specials (
  id                uuid primary key default gen_random_uuid(),
  brand_slug        text not null references public.brands(slug) on delete cascade,
  community_id      text not null default 'raelynn',
  title             text not null,
  description       text,
  image_url         text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  recurrence_rule   text,
  days_of_week      smallint[],
  redemption_code   text,
  points_required   integer,
  tier              text not null default 'public'
                    check (tier in ('public', 'premium', 'founder-only')),
  sort_order        smallint not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table  public.specials                    is 'Time-windowed offers brands publish to their members. Recurring (RRULE or days_of_week) or one-shot (starts_at/ends_at). Redemption is on the honor system in V1 — members show the code at the register. POS-tied redemption tracking lands in V2.';
comment on column public.specials.recurrence_rule    is 'iCal RRULE format, e.g. ''FREQ=WEEKLY;BYDAY=TU'' for "every Tuesday". Use this OR days_of_week, not both.';
comment on column public.specials.days_of_week       is 'Alternative to recurrence_rule for simple weekly patterns: [1,3,5] = Mon/Wed/Fri (1=Mon … 7=Sun, ISO 8601).';
comment on column public.specials.redemption_code    is 'Short code (e.g. "TUES2FOR1") the member tells the cashier. NULL = no code, just show membership.';
comment on column public.specials.points_required   is 'Optional point cost to redeem this special. NULL = free for any member. >0 = members spend points to claim. Different from rewards_catalog (which is the broader rewards system). Use this only for low-cost ad-hoc specials.';
comment on column public.specials.tier               is 'Visibility gate: public = visible to all members; premium = only paid members; founder-only = only founders. Mirrors community_posts.visibility.';

-- Indexes
create index if not exists specials_brand_active_idx
  on public.specials (brand_slug, active);
create index if not exists specials_community_active_idx
  on public.specials (community_id, active);
create index if not exists specials_window_idx
  on public.specials (starts_at, ends_at)
  where active = true;

-- updated_at trigger (uses the public.set_updated_at function from 0001)
drop trigger if exists specials_set_updated_at on public.specials;
create trigger specials_set_updated_at
  before update on public.specials
  for each row execute function public.set_updated_at();

-- ─── 4. RLS on specials ────────────────────────────────────────────────────
alter table public.specials enable row level security;

-- Public can read active specials (the consumer app shows them to logged-out
-- visitors so they can decide to join the brand's club).
drop policy if exists specials_public_read on public.specials;
create policy specials_public_read on public.specials
  for select using (active = true);

-- Admins of the brand's community can do anything.
drop policy if exists specials_admin_all on public.specials;
create policy specials_admin_all on public.specials
  for all using (public.is_admin_of(community_id));

-- ─── 5. Grants ────────────────────────────────────────────────────────────
grant select on public.specials to anon, authenticated;
grant all on public.specials to service_role;

-- ─── 6. Verify (commented; uncomment to spot-check) ───────────────────────
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'brands'
-- order by ordinal_position;
--
-- \d public.specials
