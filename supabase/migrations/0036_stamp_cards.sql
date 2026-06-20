-- Feature: stamp card config per brand
-- Admin sets how many check-ins earn a stamp reward. Stamps are derived
-- from checkins count — no separate stamp row needed.

create table public.stamp_card_configs (
  brand_slug          text    primary key,
  stamps_required     int     not null default 5,
  reward_title        text    not null default 'Free item',
  reward_description  text,
  active              bool    not null default true,
  created_at          timestamptz not null default now()
);

alter table public.stamp_card_configs enable row level security;

create policy "Anyone can read active stamp configs"
  on public.stamp_card_configs for select
  using (active = true);
