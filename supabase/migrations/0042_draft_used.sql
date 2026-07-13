-- ============================================================================
-- 0042_draft_used.sql — Brand Engage Pro: AI draft tracking
-- ============================================================================
-- Tracks whether a community_comments row originated from an AI-generated
-- draft chip. Used to A/B measure engagement lift from AI-drafted replies.
-- ============================================================================

alter table public.community_comments
  add column if not exists draft_used boolean not null default false;

comment on column public.community_comments.draft_used is
  'True if this comment originated from an AI-generated draft chip in the comment composer. Used for measuring the engagement lift of AI-drafted replies.';

create index if not exists community_comments_draft_used_idx
  on public.community_comments (created_at desc)
  where draft_used = true;
