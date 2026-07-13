-- ============================================================================
-- 0043_post_tags.sql — Brand Engage Pro: AI auto-tagging
-- ============================================================================
-- Adds tags column to community_posts. Each post gets 1-4 tags assigned
-- by an AI classifier. Tags power filter chips, digest grouping, and
-- platform-wide analytics.
-- ============================================================================

alter table public.community_posts
  add column if not exists tags text[] not null default '{}',
  add column if not exists tagged_at timestamptz,
  add column if not exists tag_model text,
  add column if not exists tag_prompt_version text;

comment on column public.community_posts.tags is
  'AI-assigned semantic tags from a closed vocabulary (e.g. event_announcement, new_product, member_spotlight). Set by /lib/tagging classifier and the tags-backfill cron.';

-- GIN for cheap @> / && filter queries
create index if not exists community_posts_tags_gin_idx
  on public.community_posts using gin (tags);

-- Partial index for backfill cron
create index if not exists community_posts_untagged_idx
  on public.community_posts (created_at desc)
  where tagged_at is null;

create or replace function public.list_untagged_posts(
  p_limit int default 50
) returns table (
  post_id      uuid,
  brand_slug   text,
  body_text    text,
  context      jsonb
)
language sql
security definer
stable
as $$
  select
    p.id,
    p.brand_slug,
    coalesce(p.title || E'\n\n' || p.body, p.body),
    jsonb_build_object('community_id', p.brand_slug, 'kind', p.kind, 'visibility', p.visibility)
  from public.community_posts p
  where p.tagged_at is null
    and coalesce(length(p.body), 0) > 0
    and (p.moderation_status is null or p.moderation_status != 'auto_hide')
  order by p.created_at desc
  limit p_limit;
$$;

grant execute on function public.list_untagged_posts to service_role;

create or replace function public.list_top_tags_for_community(
  p_brand_slug text,
  p_limit int default 12
) returns table (
  tag        text,
  post_count bigint
)
language sql
security invoker
stable
as $$
  select
    t.tag,
    count(*) as post_count
  from public.community_posts p,
       unnest(p.tags) as t(tag)
  where p.brand_slug = p_brand_slug
    and (p.moderation_status is null or p.moderation_status != 'auto_hide')
  group by t.tag
  order by post_count desc, t.tag asc
  limit p_limit;
$$;

grant execute on function public.list_top_tags_for_community to anon, authenticated;
