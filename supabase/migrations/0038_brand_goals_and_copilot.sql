-- ────────────────────────────────────────────────────────────────────────────
-- Brand Engage Pro — brand goals + copilot brief cache
--
-- brand_goals: data-driven community goals ("500 check-ins this month",
-- "1,000 members") with progress computed live from points_ledger /
-- member_community_memberships. Powers the goal module on /brands/[slug],
-- the /admin/goals CRUD page, and the /share/goal share card.
--
-- copilot_briefs: cached AI briefs for the in-app /admin/copilot page,
-- one row per generation (latest wins), same pattern as admin_briefs.
--
-- Idempotent — safe to re-run.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.brand_goals (
  id            uuid primary key default gen_random_uuid(),
  community_id  text not null references public.communities(slug) on delete cascade,
  title         text not null,
  description   text,
  -- ledger_count: count of points_ledger rows with source = metric_ref
  -- member_count: total members in the community (metric_ref unused)
  -- points_sum:   sum of positive ledger deltas (optionally source = metric_ref)
  metric        text not null check (metric in ('ledger_count','member_count','points_sum')),
  metric_ref    text,
  target        integer not null check (target > 0),
  starts_at     timestamptz not null default now(),
  ends_at       timestamptz,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists brand_goals_community_idx
  on public.brand_goals (community_id, active, starts_at desc);

alter table public.brand_goals enable row level security;

drop policy if exists "brand_goals_public_read" on public.brand_goals;
create policy "brand_goals_public_read" on public.brand_goals
  for select using (active = true);

create table if not exists public.copilot_briefs (
  id             uuid primary key default gen_random_uuid(),
  community_id   text not null references public.communities(slug) on delete cascade,
  payload        jsonb not null,
  model          text,
  prompt_version text,
  generated_at   timestamptz not null default now()
);

create index if not exists copilot_briefs_community_idx
  on public.copilot_briefs (community_id, generated_at desc);

alter table public.copilot_briefs enable row level security;
-- No public policies: service-role only (admin pages use the admin client).
