-- 0050_purge_marketplace_music_skus.sql
-- Soft-launch guest trust: deactivate Fan Engage / music leftover SKUs so
-- marketplace + catalogs never market artist redeemables on BEP.
-- Keep restaurant / Nellie's dining items. Idempotent.

-- Titles from Guide marketplace purge list (exact match on offers + catalog).
with music_titles as (
  select unnest(array[
    'Fan-to-Artist Q&A',
    'Artist Listening Party',
    'Artist Photography Print',
    'Early Music Release',
    'Studio Session Observer Pass',
    'Tour Laminate / Credential',
    'Signed Vinyl or CD',
    'Personal Video Shoutout',
    'Free Showcase Ticket',
    'Exclusive Pre-Sale Code',
    'Priority Ticket Window',
    -- Legacy global / alternate naming from older seeds
    'Video Shoutout'
  ]) as title
)
update public.offers o
   set active = false
  from music_titles m
 where o.title = m.title
   and o.active = true;

with music_titles as (
  select unnest(array[
    'Fan-to-Artist Q&A',
    'Artist Listening Party',
    'Artist Photography Print',
    'Early Music Release',
    'Studio Session Observer Pass',
    'Tour Laminate / Credential',
    'Signed Vinyl or CD',
    'Personal Video Shoutout',
    'Free Showcase Ticket',
    'Exclusive Pre-Sale Code',
    'Priority Ticket Window',
    'Video Shoutout'
  ]) as title
)
update public.rewards_catalog r
   set active = false,
       updated_at = now()
  from music_titles m
 where r.title = m.title
   and r.active = true;

-- Also deactivate known jonas-group-ent music offer slugs (slug is stable;
-- titles above cover the Guide list; this catches renamed rows).
update public.offers
   set active = false
 where community_id = 'jonas-group-ent'
   and active = true
   and slug in (
     'jge-fan-qa',
     'jge-listening-party',
     'jge-photo-print',
     'jge-early-release',
     'jge-studio-session',
     'jge-tour-laminate',
     'jge-signed-vinyl',
     'jge-video-shoutout',
     'jge-showcase-ticket',
     'jge-presale-code',
     'jge-presale-window'
   );
