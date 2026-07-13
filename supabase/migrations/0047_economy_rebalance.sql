-- ============================================================================
-- 0047_economy_rebalance.sql — make the points economy reachable
-- ============================================================================
-- Adjusted thresholds so members can reach milestones in a realistic
-- timeframe: Silver ~2 weeks, Gold ~2 months, Platinum a full season.
-- Also seeds one low-cost (250 pt) digital reward per active community
-- so new members can taste redemption in their first week.
-- ============================================================================

update tiers set min_points = 750   where slug = 'silver';
update tiers set min_points = 3500  where slug = 'gold';
update tiers set min_points = 8000  where slug = 'platinum';

-- Recompute tier on members table
update members m
   set current_tier = sub.slug
  from (
    select m2.id,
           (select slug from tiers
             where min_points <= coalesce(m2.total_points, 0)
             order by min_points desc limit 1) as slug
      from members m2
  ) sub
 where m.id = sub.id
   and sub.slug is not null
   and m.current_tier is distinct from sub.slug;

-- Recompute tier on memberships
update member_community_memberships m
   set current_tier = sub.slug
  from (
    select m2.member_id, m2.community_id,
           (select slug from tiers
             where min_points <= coalesce(m2.total_points, 0)
             order by min_points desc limit 1) as slug
      from member_community_memberships m2
  ) sub
 where m.member_id = sub.member_id and m.community_id = sub.community_id
   and sub.slug is not null
   and m.current_tier is distinct from sub.slug;

-- Starter reward per active community. Idempotent.
insert into rewards_catalog (community_id, title, description, point_cost, kind, active, sort_order)
select c.slug,
       'Exclusive Digital Reward Pack',
       'A set of exclusive digital rewards, only for members. Your first redemption is closer than you think.',
       250,
       'custom',
       true,
       0
  from communities c
 where c.active = true
   and not exists (
     select 1 from rewards_catalog r
      where r.community_id = c.slug
        and r.title = 'Exclusive Digital Reward Pack'
   );
