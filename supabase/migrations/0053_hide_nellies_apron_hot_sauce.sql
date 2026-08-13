-- 0053_hide_nellies_apron_hot_sauce.sql
-- Soft-hide Nellie's Apron + Recipe Card and House Hot Sauce 3-Pack.
-- Do not delete catalog rows. Jackie launch is join / 3-visit / birthday
-- perks + Bourbon & Cigar Night — not merch SKUs.
-- 0049 published these two as the only "stocked" redeemables. Idempotent.
--
-- APPLY on BEP Supabase project enfpviapxvqyoarwwsuf (SQL Editor → Run)
-- after 0052. Safe to re-run.

update public.rewards_catalog
   set active = false,
       updated_at = now()
 where community_id = 'nellies'
   and (
     title ilike '%apron%'
     or title ilike '%hot sauce%'
   )
   and active = true;

update public.offers
   set active = false
 where community_id = 'nellies'
   and (
     title ilike '%apron%'
     or title ilike '%hot sauce%'
     or slug ilike '%apron%'
     or slug ilike '%hot-sauce%'
     or slug ilike '%hot_sauce%'
   )
   and active = true;

update public.specials
   set active = false
 where (community_id = 'nellies' or brand_slug = 'nellies')
   and (
     title ilike '%apron%'
     or title ilike '%hot sauce%'
   )
   and active = true;
