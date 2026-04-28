-- ============================================================================
-- 0027_draft_used.sql — BEP Phase 3: AI-drafted comment A/B flag
-- ============================================================================
-- BEP port of FE migration 0026. Adds a single boolean to community_comments
-- so we can A/B-compare engagement between AI-assisted and manually-typed
-- comments (does the drafter actually drive the +30% comment-volume lift
-- the recs doc hypothesizes?).
--
-- Default false. Existing rows correctly tagged as fan-typed (no drafter
-- existed before this migration).
--
-- Idempotent.
-- ============================================================================

alter table public.community_comments
  add column if not exists draft_used boolean not null default false;

comment on column public.community_comments.draft_used is
  'Phase E.3: true if the comment body started life as a Claude
   drafter chip pick. The fan may have edited it after — we count
   the chip click as draft_used regardless. Used post-launch to
   compare engagement metrics between drafted vs unassisted comments.';

