-- ────────────────────────────────────────────────────────────────────────────
-- 0026_nellies_brand_activate.sql
--
-- Activates Nellie's Southern Kitchen as the first restaurant brand on the
-- platform. Nellie's was seeded inactive in 0011 and intentionally skipped in
-- 0012 ("Kevin wants those on a later phase"). This is that phase.
--
-- Sets the full brand profile (tagline, bio, accent palette, address, hours,
-- socials, hero image), seeds four launch specials (two public, one founder-
-- only, one premium), and seeds three upcoming events.
--
-- Idempotent. Safe to re-run.
-- ────────────────────────────────────────────────────────────────────────────

-- ─── 1. Activate the community row ───────────────────────────────────────────
-- Mirrors the shape used in 0012 for Danger Twins / Dan Marshall / Hunter
-- Hawkins. Keeps the admin community switcher and founder-wall plumbing in
-- sync with the brands row below.

update public.communities set
  active       = true,
  tagline      = 'It feels good to be home.',
  accent_from  = '#1f2937',
  accent_to    = '#d4a857'
where slug = 'nellies';


-- ─── 2. Brand row — full profile ─────────────────────────────────────────────
-- The brands row is the source of truth for /brands/nellies. Bio uses
-- \n\n for paragraph breaks (rendered with whitespace-pre-line).
--
-- accent_from / accent_to picks: charcoal → warm gold. Pulled from the iron
-- signage and platinum-record palette in the photos. Avoids the generic
-- "Southern red" trope and reads better against the dark hero overlay.

insert into public.brands (
  slug, name, tagline, bio, hero_image,
  accent_from, accent_to, genres, social,
  active, sort_order,
  category, address, city, state, postal_code, country,
  cuisine, phone, website_url, hours_json
) values (
  'nellies',
  'Nellie''s Southern Kitchen',
  'It feels good to be home.',
  E'Nellie''s Southern Kitchen is a love letter to Nellie Jonas — a Belmont woman, a working cook, a host who believed nobody should leave the table hungry. She lived on Main Street until 2011, and her recipes, her hospitality, and her stubborn insistence on the perfect biscuit are the foundation of everything we serve.\n\nWe opened the doors in June 2016 at 36 N. Main, a few blocks from where she used to live. The food is the food she made: chicken ''n'' dumplings, drunken collard greens, shrimp and grits, fried chicken on a Sunday. Made in-house. Never frozen.\n\nThe dining room is loud on purpose. Our servers sing — actually sing, with a band, on weekend nights. There''s a hallway in the back lined with platinum records and family photos — proof that Belmont raised more than one Jonas, and proof that no matter how far you go, you come home for the biscuits.\n\nFeatured in Charlotte Magazine''s "25 Best New Restaurants" and the Chicago Tribune''s 7 must-visit Southern restaurants. Come hungry.',
  '/brands/nellies/hero-sign.jpg',
  '#1f2937', '#d4a857',
  array['Southern','Soul food','Family-style']::text[],
  '[
    {"label":"Instagram","href":"https://www.instagram.com/nelliessouthernkitchen/"},
    {"label":"Facebook","href":"https://www.facebook.com/nelliessouthernkitchen"},
    {"label":"Website","href":"https://www.nelliessouthernkitchen.com/"},
    {"label":"OpenTable","href":"https://www.opentable.com/nellies-southern-kitchen"}
  ]'::jsonb,
  true, 5,
  'restaurant',
  '36 N. Main St.',
  'Belmont',
  'NC',
  '28012',
  'US',
  'Southern',
  '704-396-7169',
  'https://www.nelliessouthernkitchen.com/',
  '{
    "mon":[{"open":"11:00","close":"21:00"}],
    "tue":[{"open":"11:00","close":"21:00"}],
    "wed":[{"open":"11:00","close":"21:00"}],
    "thu":[{"open":"11:00","close":"21:00"}],
    "fri":[{"open":"11:00","close":"22:00"}],
    "sat":[{"open":"10:00","close":"22:00"}],
    "sun":[{"open":"10:00","close":"21:00"}]
  }'::jsonb
)
on conflict (slug) do update set
  name         = excluded.name,
  tagline      = excluded.tagline,
  bio          = excluded.bio,
  hero_image   = excluded.hero_image,
  accent_from  = excluded.accent_from,
  accent_to    = excluded.accent_to,
  genres       = excluded.genres,
  social       = excluded.social,
  active       = true,
  sort_order   = excluded.sort_order,
  category     = excluded.category,
  address      = excluded.address,
  city         = excluded.city,
  state        = excluded.state,
  postal_code  = excluded.postal_code,
  country      = excluded.country,
  cuisine      = excluded.cuisine,
  phone        = excluded.phone,
  website_url  = excluded.website_url,
  hours_json   = excluded.hours_json;


-- ─── 3. Specials ────────────────────────────────────────────────────────────
-- Re-seedable: clear any prior nellies specials, then insert. This is safer
-- than upserting on a natural key because specials don't have a stable one.
-- (Manual edits made via /admin/* will be overwritten on re-run — by design
-- for V1 seed migrations. Once the admin UI is the source of truth, drop the
-- delete and use INSERT ... ON CONFLICT DO NOTHING by id.)

delete from public.specials where brand_slug = 'nellies';

insert into public.specials (
  brand_slug, community_id, title, description,
  days_of_week, recurrence_rule, redemption_code,
  tier, sort_order, active
) values
  (
    'nellies', 'nellies',
    '2-for-1 Fried Chicken Tuesdays',
    'Buy one fried chicken plate, get the second on the house. Dine-in only. Show your member card at the table.',
    array[2]::smallint[],
    'FREQ=WEEKLY;BYDAY=TU',
    'FRIED2FOR1',
    'public', 1, true
  ),
  (
    'nellies', 'nellies',
    'Bottomless Biscuits at Sunday Brunch',
    'Members get bottomless buttermilk biscuits and house jam with any brunch entrée. Sundays, 10a–2p.',
    array[7]::smallint[],
    'FREQ=WEEKLY;BYDAY=SU',
    'BISCUITSUNDAY',
    'public', 2, true
  ),
  (
    'nellies', 'nellies',
    'The Memorabilia Hallway Tour',
    'An after-hours private walk through the Jonas family memorabilia hallway, hosted by a Nellie''s manager. Hear the story behind every gold record, magazine cover, and Camp Rock poster on the wall. Founders only — first Saturday of the month, by reservation.',
    null,
    null,
    'HALLWAYTOUR',
    'founder-only', 3, true
  ),
  (
    'nellies', 'nellies',
    'Reserved Booth on Live Music Nights',
    'Skip the wait on band nights. Premium members get a guaranteed reserved booth and a complimentary order of drunken collard greens. Friday & Saturday evenings.',
    array[5,6]::smallint[],
    'FREQ=WEEKLY;BYDAY=FR,SA',
    'LIVEBOOTH',
    'premium', 4, true
  );


-- ─── 4. Upcoming events ─────────────────────────────────────────────────────
-- Same delete-then-insert pattern. event_date is the human-readable string
-- shown on the brand page; starts_at / ends_at drive ICS export and
-- ordering. Dates are placeholders pegged to mid-2026 — refine via admin.

delete from public.brand_events where brand_slug = 'nellies';

insert into public.brand_events (
  brand_slug, title, detail, event_date,
  starts_at, ends_at,
  location, capacity, sort_order, active, tier
) values
  (
    'nellies',
    'Sunday Supper Series — Live Band Night',
    'Family-style supper, full bar, and a live country/Americana band. Members get the first round of biscuits on the house.',
    'Sunday, May 17 · 6 PM',
    '2026-05-17 18:00:00-04',
    '2026-05-17 22:00:00-04',
    'Nellie''s Southern Kitchen, 36 N. Main St., Belmont NC',
    80, 1, true, 'public'
  ),
  (
    'nellies',
    'Biscuit-Making Class with the Kitchen',
    'Hands-on class with our pastry team. Learn the buttermilk-biscuit method we use every morning, then eat what you made with house jam, sausage gravy, and coffee. Apron and recipe card to take home.',
    'Saturday, June 13 · 10 AM',
    '2026-06-13 10:00:00-04',
    '2026-06-13 12:00:00-04',
    'Nellie''s Southern Kitchen, 36 N. Main St., Belmont NC',
    16, 2, true, 'premium'
  ),
  (
    'nellies',
    'Belmont Block Party — Community Cookout',
    'We close Main Street, fire up the big smokers, and feed the neighborhood. Live music on the rooftop, kids'' table, and a percentage of sales goes to the Belmont food pantry.',
    'Saturday, July 4 · 2 PM',
    '2026-07-04 14:00:00-04',
    '2026-07-04 21:00:00-04',
    '36 N. Main St., Belmont NC',
    null, 3, true, 'public'
  );


-- ─── 5. Smoke-test queries (commented; uncomment to spot-check) ─────────────
-- select slug, name, active, tagline, city, phone from brands where slug='nellies';
-- select title, tier, sort_order from specials where brand_slug='nellies' order by sort_order;
-- select title, event_date, tier from brand_events where brand_slug='nellies' order by sort_order;
