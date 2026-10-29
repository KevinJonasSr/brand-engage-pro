-- 0081_follow_join_sync.sql
--
-- Follow = Join. Idempotent.
--
-- A member's relationship to a brand lived in two tables that nothing kept
-- in sync: member_brand_following (0006, read by Member Home, notifications,
-- anniversaries, streaks, push opt-in) and member_community_memberships
-- (0011, read by points, tiers, entitlements, founders, rewards). 0011 said
-- following would be "supplanted by memberships"; it never was. Members who
-- joined at onboarding followed nobody and got no brand notifications;
-- members who only tapped Follow had no membership and hit paywalls.
--
-- Membership is the record of truth. Following is kept as a projection of
-- it so every existing reader keeps working:
--   * inserting an active membership upserts a following row (trigger)
--   * inserting a following row upserts an active membership (trigger),
--     when the brand has a communities row (every activated brand does)
--   * one-time backfill in both directions
-- Unfollow deletes only the following row (the member keeps their points
-- history); a suspended membership is never re-followed by the trigger.

-- ── membership → following ───────────────────────────────────────────────
create or replace function public.sync_following_from_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active'
     and exists (select 1 from public.brands b where b.slug = new.community_id) then
    insert into public.member_brand_following (member_id, brand_slug, followed_at)
    values (new.member_id, new.community_id, coalesce(new.joined_at, now()))
    on conflict (member_id, brand_slug) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_following_from_membership
  on public.member_community_memberships;
create trigger trg_sync_following_from_membership
  after insert on public.member_community_memberships
  for each row execute function public.sync_following_from_membership();

-- ── following → membership ───────────────────────────────────────────────
create or replace function public.sync_membership_from_following()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.communities c where c.slug = new.brand_slug) then
    insert into public.member_community_memberships
      (member_id, community_id, joined_at, status)
    values (new.member_id, new.brand_slug, coalesce(new.followed_at, now()), 'active')
    on conflict (member_id, community_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_membership_from_following
  on public.member_brand_following;
create trigger trg_sync_membership_from_following
  after insert on public.member_brand_following
  for each row execute function public.sync_membership_from_following();

-- ── backfill ─────────────────────────────────────────────────────────────
insert into public.member_brand_following (member_id, brand_slug, followed_at)
select m.member_id, m.community_id, coalesce(m.joined_at, now())
  from public.member_community_memberships m
  join public.brands b on b.slug = m.community_id
 where m.status = 'active'
on conflict (member_id, brand_slug) do nothing;

insert into public.member_community_memberships (member_id, community_id, joined_at, status)
select f.member_id, f.brand_slug, coalesce(f.followed_at, now()), 'active'
  from public.member_brand_following f
  join public.communities c on c.slug = f.brand_slug
on conflict (member_id, community_id) do nothing;
