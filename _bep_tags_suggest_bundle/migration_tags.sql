-- AI #5 (BEP) — add community_posts.tags column + GIN index.
--
-- Mirrors FE migration 0028 but for BEP. Idempotent — safe to re-run.
-- The TagSuggester writes to this column on submit; the existing
-- M-2 filter-chips UI on BEP will start showing real tag counts once
-- posts get tagged (either via this composer or the existing auto-tag
-- cron, if/when ported).

alter table public.community_posts
  add column if not exists tags text[];

create index if not exists idx_community_posts_tags
  on public.community_posts
  using gin (tags);
