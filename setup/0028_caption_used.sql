-- ============================================================================
-- 0028_caption_used.sql — BEP Phase E.5: Image-aware post captions (A/B flag)
-- ============================================================================
-- BEP port of FE migration 0031. Single boolean on community_posts. Mirrors
-- draft_used (E.3) so we can A/B-compare engagement between AI-captioned
-- and member-typed image posts.
--
-- Default false. Existing rows correctly tagged as member-typed.
-- Idempotent.
-- ============================================================================

alter table public.community_posts
  add column if not exists caption_used boolean not null default false;

comment on column public.community_posts.caption_used is
  'Phase E.5: true if the post body was prefilled from a Claude vision
   caption suggestion. Used post-launch to A/B-compare engagement between
   AI-assisted and unassisted image posts.';

