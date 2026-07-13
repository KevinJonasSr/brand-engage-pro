-- ============================================================================
-- 0044_caption_used.sql — Brand Engage Pro: AI caption tracking
-- ============================================================================
-- Tracks whether a post was created using a Claude-suggested caption.
-- Used for A/B comparison of post engagement between AI-assisted and
-- unassisted image posts.
-- ============================================================================

alter table public.community_posts
  add column if not exists caption_used boolean not null default false;

comment on column public.community_posts.caption_used is
  'True if the post body was prefilled from a Claude vision caption suggestion. Used to A/B-compare engagement between AI-assisted and unassisted image posts.';
