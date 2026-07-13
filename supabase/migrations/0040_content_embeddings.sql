-- ============================================================================
-- 0040_content_embeddings.sql — Brand Engage Pro: pgvector pipeline
-- ============================================================================
-- Adds vector embeddings infrastructure for semantic search and
-- AI recommendations across community posts, comments, communities,
-- brand events, and rewards catalog.
-- ============================================================================

create extension if not exists vector;

create table if not exists public.content_embeddings (
  id            uuid primary key default gen_random_uuid(),
  source_table  text not null
                check (source_table in (
                  'community_posts',
                  'community_comments',
                  'communities',
                  'brand_events',
                  'rewards_catalog'
                )),
  source_id     uuid not null,
  community_id  text not null references public.communities(slug) on delete cascade,
  visibility    text not null default 'public'
                check (visibility in ('public', 'premium', 'founder-only', 'private')),
  embedding     vector(1536) not null,
  content_hash  text not null,
  model         text not null default 'text-embedding-3-small',
  model_version text not null default '1',
  embedded_at   timestamptz not null default now(),
  unique (source_table, source_id)
);

comment on table  public.content_embeddings is 'Vector embeddings for text-bearing rows in Brand Engage Pro. RLS policies on source tables govern access to the underlying content.';
comment on column public.content_embeddings.content_hash is 'SHA-256 of the normalized embeddable text — lets the indexing worker skip unchanged rows.';

create index if not exists content_embeddings_hnsw_idx
  on public.content_embeddings
  using hnsw (embedding vector_cosine_ops);

create index if not exists content_embeddings_community_idx
  on public.content_embeddings (community_id, visibility);

alter table public.content_embeddings enable row level security;

drop policy if exists content_embeddings_public_read on public.content_embeddings;
create policy content_embeddings_public_read on public.content_embeddings
  for select using (visibility = 'public');

drop policy if exists content_embeddings_premium_read on public.content_embeddings;
create policy content_embeddings_premium_read on public.content_embeddings
  for select to authenticated using (
    visibility = 'premium' and exists (
      select 1 from public.member_community_memberships m
      where m.member_id = auth.uid()
        and m.community_id = content_embeddings.community_id
        and m.subscription_tier in ('premium', 'comped', 'past_due')
    )
  );

drop policy if exists content_embeddings_admin_read on public.content_embeddings;
create policy content_embeddings_admin_read on public.content_embeddings
  for select to authenticated using (public.is_admin_of(community_id));

grant select on public.content_embeddings to anon, authenticated;
grant all    on public.content_embeddings to service_role;

create or replace function public.search_embeddings(
  p_query        vector(1536),
  p_community_id text default null,
  p_visibility   text default 'public',
  p_source_table text default null,
  p_limit        int  default 20
) returns table (
  source_table text,
  source_id    uuid,
  community_id text,
  visibility   text,
  distance     float
)
language sql
security invoker
stable
as $$
  select
    e.source_table,
    e.source_id,
    e.community_id,
    e.visibility,
    (e.embedding <=> p_query) as distance
  from public.content_embeddings e
  where (p_community_id is null or e.community_id = p_community_id)
    and (p_source_table is null or e.source_table = p_source_table)
    and (
      p_visibility = 'public'         and e.visibility = 'public'
      or p_visibility = 'premium'      and e.visibility in ('public', 'premium')
      or p_visibility = 'founder-only' and e.visibility in ('public', 'premium', 'founder-only')
      or p_visibility = 'private'
    )
  order by e.embedding <=> p_query
  limit p_limit;
$$;

grant execute on function public.search_embeddings to anon, authenticated;

create or replace function public.list_unembedded_rows(
  p_limit int default 100
) returns table (
  source_table text,
  source_id    uuid,
  community_id text
)
language sql
security definer
stable
as $$
  select 'community_posts'::text, p.id, p.brand_slug
  from public.community_posts p
  left join public.content_embeddings e
    on e.source_table = 'community_posts' and e.source_id = p.id
  where e.id is null
  union all

  select 'community_comments'::text, c.id, p.brand_slug
  from public.community_comments c
  join public.community_posts p on p.id = c.post_id
  left join public.content_embeddings e
    on e.source_table = 'community_comments' and e.source_id = c.id
  where e.id is null
  union all

  select 'communities'::text,
         (md5('community:' || c.slug))::uuid,
         c.slug
  from public.communities c
  left join public.content_embeddings e
    on e.source_table = 'communities' and e.source_id = (md5('community:' || c.slug))::uuid
  where e.id is null and c.active = true
  union all

  select 'brand_events'::text, ev.id, ev.brand_slug
  from public.brand_events ev
  left join public.content_embeddings e
    on e.source_table = 'brand_events' and e.source_id = ev.id
  where e.id is null and ev.active = true
  union all

  select 'rewards_catalog'::text, r.id, r.community_id
  from public.rewards_catalog r
  left join public.content_embeddings e
    on e.source_table = 'rewards_catalog' and e.source_id = r.id
  where e.id is null and r.active = true and r.community_id is not null

  limit p_limit;
$$;

grant execute on function public.list_unembedded_rows to service_role;
