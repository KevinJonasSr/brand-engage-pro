-- 0049_nellies_soft_launch_redeemables.sql
-- Soft-launch CS truth: live Nellie's redeemables include
--   • Nellie's Apron + Recipe Card — 1,500 pts
--   • House Hot Sauce 3-Pack — 2,200 pts
-- Idempotent. Does not remove dining rewards from 0048.

insert into public.rewards_catalog (
  community_id, title, description, point_cost, kind, active, sort_order
)
select
  'nellies',
  'Nellie''s Apron + Recipe Card',
  'Take-home apron and printed recipe card. Show your redemption to your server or host to pick up.',
  1500,
  'custom',
  true,
  5
where not exists (
  select 1 from public.rewards_catalog
  where community_id = 'nellies'
    and title = 'Nellie''s Apron + Recipe Card'
);

insert into public.rewards_catalog (
  community_id, title, description, point_cost, kind, active, sort_order
)
select
  'nellies',
  'House Hot Sauce 3-Pack',
  'Three house hot sauces to take home. Show your redemption at the register for pickup.',
  2200,
  'custom',
  true,
  6
where not exists (
  select 1 from public.rewards_catalog
  where community_id = 'nellies'
    and title = 'House Hot Sauce 3-Pack'
);

-- Align costs if an earlier seed used different titles/prices.
update public.rewards_catalog
   set point_cost = 1500,
       description = 'Take-home apron and printed recipe card. Show your redemption to your server or host to pick up.',
       active = true,
       updated_at = now()
 where community_id = 'nellies'
   and title = 'Nellie''s Apron + Recipe Card'
   and point_cost is distinct from 1500;

update public.rewards_catalog
   set point_cost = 2200,
       description = 'Three house hot sauces to take home. Show your redemption at the register for pickup.',
       active = true,
       updated_at = now()
 where community_id = 'nellies'
   and title = 'House Hot Sauce 3-Pack'
   and point_cost is distinct from 2200;

-- Hide Fan Engage-style placeholder pack from Nellie's soft-launch catalog.
update public.rewards_catalog
   set active = false,
       updated_at = now()
 where community_id = 'nellies'
   and title = 'Exclusive Digital Reward Pack'
   and active = true;
