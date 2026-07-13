-- ============================================================================
-- 0041_moderation.sql — Brand Engage Pro: AI content moderation
-- ============================================================================
-- Adds moderation columns to community_posts + community_comments so
-- every piece of user-generated content gets an automated safety
-- classification: pending → safe | flag_review | auto_hide
-- ============================================================================

alter table public.community_posts
  add column if not exists moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'safe', 'flag_review', 'auto_hide')),
  add column if not exists moderation_severity smallint check (moderation_severity between 0 and 5),
  add column if not exists moderation_categories text[],
  add column if not exists moderation_reason text,
  add column if not exists moderation_self_harm boolean not null default false,
  add column if not exists moderation_classified_at timestamptz,
  add column if not exists moderation_model text,
  add column if not exists moderation_prompt_version text;

create index if not exists community_posts_moderation_idx
  on public.community_posts (moderation_status)
  where moderation_status in ('pending', 'flag_review', 'auto_hide');

alter table public.community_comments
  add column if not exists moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'safe', 'flag_review', 'auto_hide')),
  add column if not exists moderation_severity smallint check (moderation_severity between 0 and 5),
  add column if not exists moderation_categories text[],
  add column if not exists moderation_reason text,
  add column if not exists moderation_self_harm boolean not null default false,
  add column if not exists moderation_classified_at timestamptz,
  add column if not exists moderation_model text,
  add column if not exists moderation_prompt_version text;

create index if not exists community_comments_moderation_idx
  on public.community_comments (moderation_status)
  where moderation_status in ('pending', 'flag_review', 'auto_hide');

-- RLS: auto_hide posts only visible to author + community admins
drop policy if exists community_posts_public_read on public.community_posts;
create policy community_posts_public_read on public.community_posts
  for select using (
    moderation_status in ('pending', 'safe', 'flag_review')
  );

drop policy if exists community_posts_author_read on public.community_posts;
create policy community_posts_author_read on public.community_posts
  for select to authenticated using (auth.uid() = author_id);

drop policy if exists community_posts_admin_read on public.community_posts;
create policy community_posts_admin_read on public.community_posts
  for select to authenticated using (public.is_admin_of(brand_slug));

drop policy if exists community_comments_public_read on public.community_comments;
create policy community_comments_public_read on public.community_comments
  for select using (
    moderation_status in ('pending', 'safe', 'flag_review')
  );

drop policy if exists community_comments_author_read on public.community_comments;
create policy community_comments_author_read on public.community_comments
  for select to authenticated using (auth.uid() = author_id);

drop policy if exists community_comments_admin_read on public.community_comments;
create policy community_comments_admin_read on public.community_comments
  for select to authenticated using (
    exists (
      select 1 from public.community_posts p
      where p.id = community_comments.post_id
        and public.is_admin_of(p.brand_slug)
    )
  );

create table if not exists public.moderation_decisions (
  id              uuid primary key default gen_random_uuid(),
  source_table    text not null check (source_table in ('community_posts', 'community_comments')),
  source_id       uuid not null,
  decided_by      text not null check (decided_by in ('ai', 'admin', 'system')),
  admin_user_id   uuid references auth.users(id) on delete set null,
  prior_status    text,
  new_status      text not null check (new_status in ('pending', 'safe', 'flag_review', 'auto_hide')),
  severity        smallint check (severity between 0 and 5),
  categories      text[],
  reason          text,
  self_harm       boolean not null default false,
  model           text,
  prompt_version  text,
  admin_notes     text,
  created_at      timestamptz not null default now()
);

comment on table public.moderation_decisions is 'Append-only audit log of every moderation decision (AI classifications + admin overrides).';

create index if not exists moderation_decisions_source_idx
  on public.moderation_decisions (source_table, source_id, created_at desc);

alter table public.moderation_decisions enable row level security;

drop policy if exists moderation_decisions_admin_read on public.moderation_decisions;
create policy moderation_decisions_admin_read on public.moderation_decisions
  for select to authenticated using (
    exists (
      select 1 from public.community_posts p
      where source_table = 'community_posts'
        and p.id = moderation_decisions.source_id
        and public.is_admin_of(p.brand_slug)
    )
    or exists (
      select 1 from public.community_comments c
      join public.community_posts p on p.id = c.post_id
      where source_table = 'community_comments'
        and c.id = moderation_decisions.source_id
        and public.is_admin_of(p.brand_slug)
    )
  );

grant select on public.moderation_decisions to authenticated;
grant all on public.moderation_decisions to service_role;

create or replace function public.list_pending_moderation(
  p_limit int default 50
) returns table (
  source_table text,
  source_id    uuid,
  body_text    text,
  context      jsonb
)
language sql
security definer
stable
as $$
  select
    'community_posts'::text,
    p.id,
    coalesce(p.title || E'\n\n' || p.body, p.body),
    jsonb_build_object('community_id', p.brand_slug, 'kind', p.kind, 'visibility', p.visibility)
  from public.community_posts p
  where p.moderation_status = 'pending'
    and coalesce(length(p.body), 0) > 0
  union all

  select
    'community_comments'::text,
    c.id,
    c.body,
    jsonb_build_object('community_id', p.brand_slug, 'post_id', c.post_id)
  from public.community_comments c
  join public.community_posts p on p.id = c.post_id
  where c.moderation_status = 'pending'
    and coalesce(length(c.body), 0) > 0

  limit p_limit;
$$;

grant execute on function public.list_pending_moderation to service_role;

create or replace function public.apply_moderation_decision(
  p_source_table   text,
  p_source_id      uuid,
  p_decided_by     text,
  p_admin_user_id  uuid,
  p_new_status     text,
  p_severity       smallint,
  p_categories     text[],
  p_reason         text,
  p_self_harm      boolean,
  p_model          text,
  p_prompt_version text,
  p_admin_notes    text
) returns void
language plpgsql
security definer
as $$
declare
  v_prior_status text;
begin
  if p_source_table = 'community_posts' then
    select moderation_status into v_prior_status
    from public.community_posts where id = p_source_id;
  elsif p_source_table = 'community_comments' then
    select moderation_status into v_prior_status
    from public.community_comments where id = p_source_id;
  else
    raise exception 'Unknown source_table: %', p_source_table;
  end if;

  if p_source_table = 'community_posts' then
    update public.community_posts set
      moderation_status         = p_new_status,
      moderation_severity       = p_severity,
      moderation_categories     = p_categories,
      moderation_reason         = p_reason,
      moderation_self_harm      = p_self_harm,
      moderation_classified_at  = now(),
      moderation_model          = p_model,
      moderation_prompt_version = p_prompt_version
    where id = p_source_id;
  else
    update public.community_comments set
      moderation_status         = p_new_status,
      moderation_severity       = p_severity,
      moderation_categories     = p_categories,
      moderation_reason         = p_reason,
      moderation_self_harm      = p_self_harm,
      moderation_classified_at  = now(),
      moderation_model          = p_model,
      moderation_prompt_version = p_prompt_version
    where id = p_source_id;
  end if;

  insert into public.moderation_decisions (
    source_table, source_id, decided_by, admin_user_id,
    prior_status, new_status, severity, categories, reason,
    self_harm, model, prompt_version, admin_notes
  ) values (
    p_source_table, p_source_id, p_decided_by, p_admin_user_id,
    v_prior_status, p_new_status, p_severity, p_categories, p_reason,
    p_self_harm, p_model, p_prompt_version, p_admin_notes
  );
end;
$$;

grant execute on function public.apply_moderation_decision to service_role;
