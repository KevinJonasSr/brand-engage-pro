-- 0054_jge_aug30_specials_lock.sql
-- Kevin lock (Aug 30): JGE live specials only.
-- HIDE: roster/presale, member listening parties, songwriter rounds.
-- SURFACE: Music Row house tour, early writer/artist listens,
--          capped rotating live access (Kevin / Leslie / Amanda / Abby / Raymond).
-- Do not touch Nellie's Jackie launch set.
--
-- APPLY on BEP Supabase project enfpviapxvqyoarwwsuf (SQL Editor → Run)
-- after 0053. Safe to re-run.

-- Hide removed JGE specials (keep rows; do not delete).
update public.specials
   set active = false
 where (community_id = 'jonas-group-ent' or brand_slug = 'jonas-group-ent')
   and (
     title ilike '%presale%'
     or title ilike '%listening part%'
     or title ilike '%songwriter round%'
     or title ilike '%writers'' round%'
     or title ilike '%writers round%'
   )
   and active = true;

-- Hide matching leftover events so they do not reappear as Upcoming.
update public.brand_events
   set active = false
 where brand_slug = 'jonas-group-ent'
   and (
     title ilike '%presale%'
     or title ilike '%listening part%'
     or title ilike '%songwriter round%'
   )
   and active = true;

-- Surface Music Row House Tour as a live public special (was founder-only).
update public.specials
   set active = true,
       tier = 'public',
       sort_order = 1,
       description = 'A private guided tour of the Jonas Group Entertainment house at 1600 17th Ave South — writer rooms, offices, and the wall of cuts. By reservation.'
 where (community_id = 'jonas-group-ent' or brand_slug = 'jonas-group-ent')
   and title ilike 'Music Row House Tour%'
   and title not ilike '%presale%'
   and title not ilike '%listening%';

insert into public.specials (
  brand_slug, community_id, title, description,
  days_of_week, recurrence_rule, redemption_code,
  tier, sort_order, active
)
select
  'jonas-group-ent', 'jonas-group-ent',
  'Music Row House Tour',
  'A private guided tour of the Jonas Group Entertainment house at 1600 17th Ave South — writer rooms, offices, and the wall of cuts. By reservation.',
  null, null, null,
  'public', 1, true
where not exists (
  select 1 from public.specials
   where (community_id = 'jonas-group-ent' or brand_slug = 'jonas-group-ent')
     and title ilike 'Music Row House Tour%'
);

insert into public.specials (
  brand_slug, community_id, title, description,
  days_of_week, recurrence_rule, redemption_code,
  tier, sort_order, active
)
select
  'jonas-group-ent', 'jonas-group-ent',
  'Early Writer / Artist Listens',
  'Hear new writer and artist work from the JGE roster before it goes wide. Dates land in the member feed.',
  null, null, null,
  'public', 2, true
where not exists (
  select 1 from public.specials
   where (community_id = 'jonas-group-ent' or brand_slug = 'jonas-group-ent')
     and title ilike '%early writer%'
);

insert into public.specials (
  brand_slug, community_id, title, description,
  days_of_week, recurrence_rule, redemption_code,
  tier, sort_order, active
)
select
  'jonas-group-ent', 'jonas-group-ent',
  'Rotating Live Access',
  'Capped live access that rotates across Kevin, Leslie, Amanda, Abby, and Raymond. Limited seats — claim when a window opens.',
  null, null, null,
  'public', 3, true
where not exists (
  select 1 from public.specials
   where (community_id = 'jonas-group-ent' or brand_slug = 'jonas-group-ent')
     and title ilike '%rotating live%'
);

-- Smoke-test (commented):
-- select title, tier, active, sort_order from public.specials
--  where brand_slug = 'jonas-group-ent' order by sort_order, title;
