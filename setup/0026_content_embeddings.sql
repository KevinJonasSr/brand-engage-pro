-- ============================================================================
-- 0026_content_embeddings.sql — BEP AI infrastructure: pgvector pipeline
-- ============================================================================
-- Brand Engage Pro port of Fan Engage migration 0024. Adds:
--
--   1. The `vector` extension (pgvector — Supabase has this available)
--   2. A single `content_embeddings` table that stores embeddings for every
--      indexed text-bearing row in BEP, keyed by (source_table, source_id).
--      Indexed sources:
--        * community_posts    (title + body)
--        * community_comments (body)
--        * communities        (display_name + tagline + bio)
--        * brand_events       (title + detail + event_date)   ← BEP rename
--        * rewards_catalog    (title + description)
--        * specials           (title + description)            ← BEP-only
--      offers/specials inclusion is BEP-specific (FE doesn't have specials).
--   3. An HNSW index for fast nearest-neighbor search at scale
--   4. RLS — same shape as FE but uses member_community_memberships and
--      member_id (BEP rename of fan_community_memberships / fan_id).
--   5. content_hash to skip re-embedding unchanged rows.
--   6. search_embeddings() RPC for nearest-neighbor queries.
--   7. list_unembedded_rows() RPC the backfill cron uses to find work.
--
-- Idempotent: re-running is safe.
--
-- Cost reference (OpenAI text-embedding-3-small @ $0.02/1M tokens):
--   * 50k posts at ~80 tokens each = 4M tokens = $0.08
--   * 1k posts/month ongoing = $0.001/month
--   Negligible.
-- ============================================================================

-- ─── 1. pgvector extension ─────────────────────────────────────────────────
create extension if not exists vector;

-- ─── 2. content_embeddings table ───────────────────────────────────────────
create table if not exists public.content_embeddings (
  id            uuid primary key default gen_random_uuid(),
  source_table  text not null
                check (source_table in (
                  'community_posts',
                  'community_comments',
                  'communities',
                  'brand_events',
                  'rewards_catalog',
                  'specials'
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

comment on table  public.content_embeddings        is 'Vector embeddings for every text-bearing row in Brand Engage Pro. Joined to source via (source_table, source_id). RLS policies on the source table govern access to the underlying content; this table just holds the vector.';
comment on column public.content_embeddings.content_hash is 'SHA-256 of the normalized embeddable text. Lets the indexing worker skip rows whose text did not change between updates.';
comment on column public.content_embeddings.visibility   is 'Mirrors the parent row''s visibility so search queries can pre-filter without joining the source.';

-- ─── 3. Indexes ────────────────────────────────────────────────────────────
create index if not exists content_embeddings_hnsw_idx
  on public.content_embeddings
  using hnsw (embedding vector_cosine_ops);

create index if not exists content_embeddings_community_idx
  on public.content_embeddings (community_id, visibility);

-- ─── 4. RLS ────────────────────────────────────────────────────────────────
alter table public.content_embeddings enable row level security;

-- Public can read public-visibility embeddings.
drop policy if exists content_embeddings_public_read on public.content_embeddings;
create policy content_embeddings_public_read on public.content_embeddings
  for select using (visibility = 'public');

-- Premium-tier members read premium embeddings in their community.
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

-- Founders read founder-only embeddings in their community.
drop policy if exists content_embeddings_founder_read on public.content_embeddings;
create policy content_embeddings_founder_read on public.content_embeddings
  for select to authenticated using (
    visibility = 'founder-only' and exists (
      select 1 from public.member_community_memberships m
      where m.member_id = auth.uid()
        and m.community_id = content_embeddings.community_id
        and m.is_founder = true
    )
  );

-- Admins read everything in their community.
drop policy if exists content_embeddings_admin_read on public.content_embeddings;
create policy content_embeddings_admin_read on public.content_embeddings
  for select to authenticated using (public.is_admin_of(community_id));

-- Writes: service_role only (bypasses RLS). No public/authenticated write policies.

-- ─── 5. Grants ────────────────────────────────────────────────────────────
grant select on public.content_embeddings to anon, authenticated;
grant all    on public.content_embeddings to service_role;

-- ─── 6. search_embeddings() — nearest-neighbor RPC ────────────────────────
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
      p_visibility = 'public'        and e.visibility = 'public'
      or p_visibility = 'premium'     and e.visibility in ('public', 'premium')
      or p_visibility = 'founder-only' and e.visibility in ('public', 'premium', 'founder-only')
      or p_visibility = 'private'
    )
  order by e.embedding <=> p_query
  limit p_limit;
$$;

comment on function public.search_embeddings is 'Nearest-neighbor search on content_embeddings. Caller passes a query vector and gets back the top K most similar rows. RLS on the underlying table is still enforced because security invoker.';

grant execute on function public.search_embeddings to anon, authenticated;

-- ─── 7. list_unembedded_rows() — work queue for backfill cron ──────────────
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
  -- community_posts (uses brand_slug as community_id in BEP)
  select 'community_posts'::text, p.id, p.brand_slug
  from public.community_posts p
  left join public.content_embeddings e
    on e.source_table = 'community_posts' and e.source_id = p.id
  where e.id is null
  union all

  -- community_comments (parent post supplies community_id via brand_slug)
  select 'community_comments'::text, c.id, p.brand_slug
  from public.community_comments c
  join public.community_posts p on p.id = c.post_id
  left join public.content_embeddings e
    on e.source_table = 'community_comments' and e.source_id = c.id
  where e.id is null
  union all

  -- communities (slug-keyed; deterministic uuid via md5)
  select 'communities'::text,
         (md5('community:' || c.slug))::uuid,
         c.slug
  from public.communities c
  left join public.content_embeddings e
    on e.source_table = 'communities' and e.source_id = (md5('community:' || c.slug))::uuid
  where e.id is null and c.active = true
  union all

  -- brand_events (BEP rename of artist_events; uses brand_slug as community_id)
  select 'brand_events'::text, ev.id, ev.brand_slug
  from public.brand_events ev
  left join public.content_embeddings e
    on e.source_table = 'brand_events' and e.source_id = ev.id
  where e.id is null and ev.active = true
  union all

  -- rewards_catalog
  select 'rewards_catalog'::text, r.id, r.community_id
  from public.rewards_catalog r
  left join public.content_embeddings e
    on e.source_table = 'rewards_catalog' and e.source_id = r.id
  where e.id is null and r.active = true and r.community_id is not null
  union all

  -- specials (BEP-only — restaurant time-windowed offers)
  select 'specials'::text, s.id, s.community_id
  from public.specials s
  left join public.content_embeddings e
    on e.source_table = 'specials' and e.source_id = s.id
  where e.id is null and s.active = true and s.community_id is not null

  limit p_limit;
$$;

comment on function public.list_unembedded_rows is 'Returns rows from any indexed source table that do not yet have an entry in content_embeddings. Used by /api/cron/embeddings-backfill to find work. BEP-specific differences from FE: brand_events instead of artist_events, brand_slug instead of artist_slug, plus specials.';

grant execute on function public.list_unembedded_rows to service_role;

-- ─── 8. Verify (commented; uncomment to spot-check) ───────────────────────
-- select count(*) from public.content_embeddings;
-- select * from public.list_unembedded_rows(5);

