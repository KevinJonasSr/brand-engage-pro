-- 0087: seed discovery location fields for the two live brands.
--
-- Migration 0024 added brands.category / city / cuisine / lat / lng for the
-- /brands discovery page, but the admin never set them, so every brand still
-- reads as a 'restaurant' with no city. This fills in what we know:
--
--   nellies          36 N. Main St., Belmont, NC 28012 — restaurant, southern.
--                    lat/lng are APPROXIMATE (downtown Belmont, from a map
--                    lookup, not a surveyed geocode). Good enough for
--                    "near me" sorting; correct via the admin
--                    "Location & category" form if a precise point is needed.
--   jonas-group-ent  Music Row, Nashville, TN. A label / publisher — none of
--                    the brand_category values (restaurant, retail, sports,
--                    hotel) fits, and 'retail' would be wrong, so category is
--                    left at the 0024 default ('restaurant') and only city is
--                    set. Revisit when the enum grows an entertainment value.
--
-- Every update is guarded with `is null` so re-running the migration, or
-- running it after an admin has edited a brand, never overwrites their edits.

update public.brands
set city = 'Belmont, NC'
where slug = 'nellies' and city is null;

update public.brands
set cuisine = 'southern'
where slug = 'nellies' and cuisine is null;

-- category has a not-null default of 'restaurant' (0024), so a null guard
-- would never match; Nellie's is a restaurant, which is already the default.
-- Set it explicitly only if the column somehow holds no value.
update public.brands
set category = 'restaurant'
where slug = 'nellies' and category is null;

update public.brands
set lat = 35.242600, lng = -81.038000   -- approximate: 36 N Main St, Belmont NC
where slug = 'nellies' and lat is null and lng is null;

update public.brands
set city = 'Nashville, TN'
where slug = 'jonas-group-ent' and city is null;
