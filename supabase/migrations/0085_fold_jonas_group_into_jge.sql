-- 0085_fold_jonas_group_into_jge.sql
--
-- The retired `jonas-group` brand slug (brands.active = false) still owned
-- one member's data from before the rename to `jonas-group-ent`: one
-- membership, one following row and 24 points_ledger rows. Every event,
-- post and reward lives on jonas-group-ent, so the old slug surfaced only
-- as a raw-slug tab on /me/card and a "jonas-group" row in the per-brand
-- mute list (found in the 2026-10-29 Sprint 2 smoke test).
--
-- Folds jonas-group into jonas-group-ent for every member. Idempotent.
-- Memberships: a member with rows for both keeps the jonas-group-ent row,
-- with points and lifetime summed and the earlier joined_at; founder and
-- subscription flags are kept if either row had them.

-- 1. Ledger rows follow the brand.
update public.points_ledger
   set community_id = 'jonas-group-ent'
 where community_id = 'jonas-group';

-- 2. Memberships: move or merge.
insert into public.member_community_memberships
  (member_id, community_id, joined_at, total_points, lifetime_points, current_tier, status)
select member_id, 'jonas-group-ent', joined_at, total_points, lifetime_points, current_tier, status
  from public.member_community_memberships
 where community_id = 'jonas-group'
on conflict (member_id, community_id) do update
   set joined_at       = least(member_community_memberships.joined_at, excluded.joined_at),
       total_points    = member_community_memberships.total_points + excluded.total_points,
       lifetime_points = member_community_memberships.lifetime_points + excluded.lifetime_points,
       status          = case when member_community_memberships.status = 'active'
                                or excluded.status = 'active' then 'active'
                              else member_community_memberships.status end;

delete from public.member_community_memberships
 where community_id = 'jonas-group';

-- 3. Following rows (the 0081 trigger will not re-create the old slug).
insert into public.member_brand_following (member_id, brand_slug, followed_at)
select member_id, 'jonas-group-ent', followed_at
  from public.member_brand_following
 where brand_slug = 'jonas-group'
on conflict (member_id, brand_slug) do nothing;

delete from public.member_brand_following
 where brand_slug = 'jonas-group';

-- 4. Badges (PK member, badge, community): move unless already earned there.
update public.member_badges b
   set community_id = 'jonas-group-ent'
 where b.community_id = 'jonas-group'
   and not exists (
     select 1 from public.member_badges x
      where x.member_id = b.member_id
        and x.badge_slug = b.badge_slug
        and x.community_id = 'jonas-group-ent'
   );
delete from public.member_badges where community_id = 'jonas-group';

-- 5. Anniversary log (unique member, brand, milestone): same rule.
update public.member_anniversary_log a
   set brand_slug = 'jonas-group-ent'
 where a.brand_slug = 'jonas-group'
   and not exists (
     select 1 from public.member_anniversary_log x
      where x.member_id = a.member_id
        and x.brand_slug = 'jonas-group-ent'
        and x.milestone = a.milestone
   );
delete from public.member_anniversary_log where brand_slug = 'jonas-group';

-- 6. Plain re-pointing where nothing is unique on the brand.
update public.notifications      set community_id = 'jonas-group-ent' where community_id = 'jonas-group';
update public.rewards_catalog    set community_id = 'jonas-group-ent' where community_id = 'jonas-group';
update public.content_embeddings set community_id = 'jonas-group-ent' where community_id = 'jonas-group';
update public.copilot_briefs     set community_id = 'jonas-group-ent' where community_id = 'jonas-group';

-- 7. Per-brand mute prefs, if any were set against the old slug.
insert into public.member_brand_notification_prefs (member_id, brand_slug, muted, updated_at)
select member_id, 'jonas-group-ent', muted, updated_at
  from public.member_brand_notification_prefs
 where brand_slug = 'jonas-group'
on conflict (member_id, brand_slug) do nothing;

delete from public.member_brand_notification_prefs
 where brand_slug = 'jonas-group';
