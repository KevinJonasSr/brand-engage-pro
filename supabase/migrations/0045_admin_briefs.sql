-- ============================================================================
-- 0045_admin_briefs.sql — Brand Engage Pro: daily admin brief log
-- ============================================================================
-- Daily cron writes one row per run with week-over-week metrics and a
-- Claude-generated narrative summary. Re-running the cron creates a new
-- row — never overwrites — so the table doubles as history.
-- ============================================================================

create table if not exists public.admin_briefs (
  id              uuid primary key default gen_random_uuid(),
  window_end      timestamptz not null default now(),
  metrics         jsonb not null,
  summary         text not null,
  prompt_version  text not null default 'v1',
  channels_sent   text[] not null default '{}',
  model           text not null default 'claude-haiku-4-5',
  generated_ms    int,
  created_at      timestamptz not null default now()
);

create index if not exists admin_briefs_created_idx
  on public.admin_briefs (created_at desc);

alter table public.admin_briefs enable row level security;

comment on table public.admin_briefs is
  'Daily admin briefs. metrics is the raw WoW data the Claude summarizer was given; summary is the narrative sent to channels / displayed in /admin/briefs.';
