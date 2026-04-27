-- ────────────────────────────────────────────────────────────────────────────
-- Brand Engage Pro — Phase 2b: automatic badges + Supabase Storage buckets
-- Safe to re-run (idempotent).
-- Apply via: Supabase dashboard → SQL Editor → paste → Run.
-- ────────────────────────────────────────────────────────────────────────────

-- ─── Fans: avatar_url + display metadata columns on badges ─────────────────
alter table public.fans
  add column if not exists avatar_url text;

alter table public.badges
  add column if not exists category    text,              -- 'welcome' | 'referral' | 'community' | 'tier'
  add column if not exists threshold   integer,           -- count needed to earn (nullable)
  add column if not exists sort_order  smallint not null default 0;

-- ─── Seed 13 starter badges ────────────────────────────────────────────────
-- Icons are emoji so no asset pipeline required.
-- point_value = bonus points awarded on earning the badge.
insert into public.badges (slug, name, description, icon, point_value, category, threshold, sort_order) values
  ('welcome',            'Welcome aboard',        'Created your fan profile.',                      '👋',  25, 'welcome',   null, 1),
  ('first-post',         'First post',             'Shared your first community post.',             '✍️',  25, 'welcome',   1,    2),
  ('first-comment',      'First comment',          'Left your first comment.',                      '💬',  15, 'welcome',   1,    3),
  ('referral-1',         'Recruiter',              'Referred your first fan.',                      '🎯',  50, 'referral',  1,    4),
  ('referral-5',         'Connector',              'Referred 5 fans to the community.',             '🧲', 150, 'referral',  5,    5),
  ('referral-10',        'Ambassador',             'Referred 10 fans — a true evangelist.',         '🌟', 400, 'referral', 10,    6),
  ('poll-voter-5',       'Poll voter',             'Voted in 5 community polls.',                   '📊',  50, 'community', 5,    7),
  ('challenge-crasher-10', 'Challenge crasher',    'Submitted 10 challenge entries.',               '🏆', 250, 'community', 10,   8),
  ('chatterbox-25',      'Chatterbox',             'Dropped 25 comments in the community.',         '💭', 100, 'community', 25,   9),
  ('tier-bronze',        'Bronze tier',            'Welcome to the Bronze circle.',                  '🥉',   0, 'tier',     null, 10),
  ('tier-silver',        'Silver tier',            'Crossed into Silver — 2,500 pts.',               '🥈',  50, 'tier',     null, 11),
  ('tier-gold',          'Gold tier',              'Reached Gold — 10,000 pts. Serious fan energy.', '🥇', 150, 'tier',     null, 12),
  ('tier-platinum',      'Platinum tier',          'Platinum unlocked — 25,000 pts. Elite status.',  '💎', 500, 'tier',     null, 13)
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  icon        = excluded.icon,
  point_value = excluded.point_value,
  category    = excluded.category,
  threshold   = excluded.threshold,
  sort_order  = excluded.sort_order;

-- ─── Helper function: award badge (idempotent, optionally awards points) ──
-- Using source='manual_adjustment' for badge bonus points since point_source
-- enum doesn't have a dedicated 'badge' value and we don't want to alter
-- enums here (that blocks the migration from being in a transaction).
create or replace function public.award_badge(p_fan_id uuid, p_slug text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_points   integer;
  v_ref      text;
  v_inserted boolean;
begin
  insert into fan_badges (fan_id, badge_slug)
  values (p_fan_id, p_slug)
  on conflict (fan_id, badge_slug) do nothing
  returning true into v_inserted;

  if v_inserted is null then return; end if;  -- already earned

  select point_value into v_points from badges where slug = p_slug;
  if coalesce(v_points, 0) > 0 then
    v_ref := 'badge:' || p_slug || ':' || p_fan_id::text;
    if not exists (select 1 from points_ledger where source_ref = v_ref) then
      insert into points_ledger (fan_id, delta, source, source_ref, note)
      values (p_fan_id, v_points, 'manual_adjustment', v_ref, 'Badge earned: ' || p_slug);

      update fans
        set total_points = coalesce(total_points, 0) + v_points
      where id = p_fan_id;
    end if;
  end if;
end $$;

-- ─── Welcome badge + bronze tier on fan creation ──────────────────────────
create or replace function public.award_signup_badges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform award_badge(new.id, 'welcome');
  perform award_badge(new.id, 'tier-bronze');
  return new;
end $$;

drop trigger if exists fans_award_signup_badges on public.fans;
create trigger fans_award_signup_badges
  after insert on public.fans
  for each row execute function public.award_signup_badges();

-- Backfill for existing fans who signed up before this migration
do $$
declare r record;
begin
  for r in select id from fans loop
    perform award_badge(r.id, 'welcome');
    perform award_badge(r.id, 'tier-bronze');
  end loop;
end $$;

-- ─── First post + community milestones on community_posts ─────────────────
create or replace function public.award_post_badges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  -- Only regular fan posts / challenge entries trigger "first post" — we
  -- don't count admin announcements or polls since those are admin-only.
  if new.kind not in ('post') then
    return new;
  end if;

  select count(*) into v_count
    from community_posts
    where author_id = new.author_id and kind = 'post';

  if v_count = 1 then
    perform award_badge(new.author_id, 'first-post');
  end if;

  return new;
end $$;

drop trigger if exists community_posts_award_badges on public.community_posts;
create trigger community_posts_award_badges
  after insert on public.community_posts
  for each row execute function public.award_post_badges();

-- ─── First comment + chatterbox (25 comments) ─────────────────────────────
create or replace function public.award_comment_badges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from community_comments where author_id = new.author_id;

  if v_count = 1 then
    perform award_badge(new.author_id, 'first-comment');
  end if;
  if v_count >= 25 then
    perform award_badge(new.author_id, 'chatterbox-25');
  end if;

  return new;
end $$;

drop trigger if exists community_comments_award_badges on public.community_comments;
create trigger community_comments_award_badges
  after insert on public.community_comments
  for each row execute function public.award_comment_badges();

-- ─── Poll voter (5 votes) ─────────────────────────────────────────────────
create or replace function public.award_poll_vote_badges()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  select count(*) into v_count
    from community_poll_votes where fan_id = new.fan_id;
  if v_count >= 5 then
    perform award_badge(new.fan_id, 'poll-voter-5');
  end if;
  return new;
end $$;

drop trigger if exists community_poll_votes_award_badges on public.community_poll_votes;
create trigger community_poll_votes_award_badges
  after insert on public.community_poll_votes
  for each row execute function public.award_poll_vote_badges();

-- ─── Challenge crasher (10 entries) ───────────────────────────────────────
create or replace function public.award_challenge_entry_badges()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  select count(*) into v_count
    from community_challenge_entries where fan_id = new.fan_id;
  if v_count >= 10 then
    perform award_badge(new.fan_id, 'challenge-crasher-10');
  end if;
  return new;
end $$;

drop trigger if exists community_challenge_entries_award_badges on public.community_challenge_entries;
create trigger community_challenge_entries_award_badges
  after insert on public.community_challenge_entries
  for each row execute function public.award_challenge_entry_badges();

-- ─── Referral milestones (1 / 5 / 10) ─────────────────────────────────────
create or replace function public.award_referral_badges()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  -- Only count verified referrals
  if new.status <> 'verified' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'verified' then return new; end if;

  select count(*) into v_count
    from referrals where referrer_id = new.referrer_id and status = 'verified';

  if v_count >= 1  then perform award_badge(new.referrer_id, 'referral-1');  end if;
  if v_count >= 5  then perform award_badge(new.referrer_id, 'referral-5');  end if;
  if v_count >= 10 then perform award_badge(new.referrer_id, 'referral-10'); end if;

  return new;
end $$;

drop trigger if exists referrals_award_badges_ins on public.referrals;
create trigger referrals_award_badges_ins
  after insert on public.referrals
  for each row execute function public.award_referral_badges();

drop trigger if exists referrals_award_badges_upd on public.referrals;
create trigger referrals_award_badges_upd
  after update of status on public.referrals
  for each row execute function public.award_referral_badges();

-- ─── Tier unlocks (on fans.current_tier change or points cross threshold) ─
create or replace function public.award_tier_badges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Always try all tiers up to current — idempotent via fan_badges PK
  perform award_badge(new.id, 'tier-bronze');
  if new.current_tier in ('silver', 'gold', 'platinum')  then perform award_badge(new.id, 'tier-silver');   end if;
  if new.current_tier in ('gold', 'platinum')            then perform award_badge(new.id, 'tier-gold');     end if;
  if new.current_tier =  'platinum'                      then perform award_badge(new.id, 'tier-platinum'); end if;
  return new;
end $$;

drop trigger if exists fans_award_tier_badges on public.fans;
create trigger fans_award_tier_badges
  after update of current_tier on public.fans
  for each row when (old.current_tier is distinct from new.current_tier)
  execute function public.award_tier_badges();

-- ─── Auto-promote fan tier when total_points crosses threshold ───────────
-- This is a nice-to-have — without it tier never advances automatically.
create or replace function public.update_fan_tier()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_new_tier tier_slug;
begin
  select slug into v_new_tier
    from tiers
    where min_points <= coalesce(new.total_points, 0)
    order by min_points desc
    limit 1;

  if v_new_tier is not null and v_new_tier <> new.current_tier then
    new.current_tier := v_new_tier;
  end if;
  return new;
end $$;

drop trigger if exists fans_update_tier on public.fans;
create trigger fans_update_tier
  before update of total_points on public.fans
  for each row execute function public.update_fan_tier();

-- ─── Supabase Storage: buckets + RLS ───────────────────────────────────────
-- Both buckets are public-read so URLs work in <img src>. Writes are
-- restricted to the fan's own top-level folder.
insert into storage.buckets (id, name, public)
values
  ('community-uploads', 'community-uploads', true),
  ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

-- Public read for both buckets
drop policy if exists community_uploads_public_read on storage.objects;
create policy community_uploads_public_read on storage.objects
  for select using (bucket_id = 'community-uploads');

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

-- Authenticated insert to own folder only (path prefix must be auth.uid())
drop policy if exists community_uploads_insert_own on storage.objects;
create policy community_uploads_insert_own on storage.objects
  for insert with check (
    bucket_id = 'community-uploads'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated update/delete only own objects (useful for avatar replace)
drop policy if exists community_uploads_update_own on storage.objects;
create policy community_uploads_update_own on storage.objects
  for update using (
    bucket_id = 'community-uploads'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists community_uploads_delete_own on storage.objects;
create policy community_uploads_delete_own on storage.objects
  for delete using (
    bucket_id = 'community-uploads'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── Smoke-test queries ────────────────────────────────────────────────────
-- select slug, name, icon, category, threshold from badges order by sort_order;
-- select id, public from storage.buckets where id in ('community-uploads','avatars');
-- select f.first_name, count(fb.*) as badges
--   from fans f left join fan_badges fb on fb.fan_id = f.id
--   group by f.first_name;
