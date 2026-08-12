-- 0049_nellies_soft_launch_redeemables.sql
-- Soft-launch CS truth: ONLY these Nellie's redeemables are stocked:
--   • Nellie's Apron + Recipe Card — 1,500 pts
--   • House Hot Sauce 3-Pack — 2,200 pts
-- Do not market empty Gold/Platinum redeemables. Idempotent.

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

update public.rewards_catalog
   set point_cost = 1500,
       description = 'Take-home apron and printed recipe card. Show your redemption to your server or host to pick up.',
       active = true,
       sort_order = 5,
       updated_at = now()
 where community_id = 'nellies'
   and title = 'Nellie''s Apron + Recipe Card';

update public.rewards_catalog
   set point_cost = 2200,
       description = 'Three house hot sauces to take home. Show your redemption at the register for pickup.',
       active = true,
       sort_order = 6,
       updated_at = now()
 where community_id = 'nellies'
   and title = 'House Hot Sauce 3-Pack';

-- Soft launch: unstock every other Nellie's catalog row so we don't market
-- empty Gold/Platinum / dining SKUs that aren't operationally ready.
update public.rewards_catalog
   set active = false,
       updated_at = now()
 where community_id = 'nellies'
   and title not in (
     'Nellie''s Apron + Recipe Card',
     'House Hot Sauce 3-Pack'
   )
   and active = true;

-- Soft launch: hide Gold/Platinum marketplace offers for Nellie's so guests
-- aren't shown locked "redeemables" that aren't stocked on the rewards tab.
update public.offers
   set active = false
 where community_id = 'nellies'
   and min_tier in ('gold', 'platinum')
   and active = true;
