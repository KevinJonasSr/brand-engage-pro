-- 0053_hide_nellies_apron_hot_sauce.sql
-- Soft-hide Nellie's Apron + Recipe Card and House Hot Sauce 3-Pack.
-- Do not delete catalog rows or events.
-- Also strip Bourbon VIP/tier leak from brand_events.detail (Platinum
-- priority / Gold waitlist). Stamp members-welcome copy. Idempotent.
--
-- APPLY on BEP Supabase project enfpviapxvqyoarwwsuf (SQL Editor → Run)
-- after 0052. Safe to re-run. Catalog updates are no-ops if already inactive.

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

-- Bourbon & Cigar Night: keep the row. Rewrite guest detail so Platinum /
-- Gold / priority / waitlist cannot render. PDR / date / cap already in 0052.
update public.brand_events
   set detail = 'Premium bourbon pours and hand-selected cigars. Members welcome.'
 where (community_id = 'nellies' or brand_slug = 'nellies')
   and title ilike '%bourbon%cigar%'
   and coalesce(detail, '') ~* 'platinum|gold members|priority seating|waitlist';
