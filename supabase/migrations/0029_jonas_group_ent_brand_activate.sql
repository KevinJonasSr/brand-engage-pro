-- ────────────────────────────────────────────────────────────────────────────
-- 0029_jonas_group_ent_brand_activate.sql
--
-- Activates Jonas Group Entertainment as the parent-label brand on the
-- platform. JGE is a full-service entertainment company on Nashville's
-- Music Row — label (Red Van Records), publishing (Jonas Group Publishing),
-- artist management, and catalog stewardship — owned by the Jonas family.
-- It already has a public following / mailing list, so the loyalty surface
-- has a built-in audience from day one.
--
-- Unlike Nellie's, JGE was NOT pre-seeded in 0011, so this migration INSERTS
-- the communities row rather than UPDATEing it. Brand row uses the new
-- 'entertainment' enum value added in 0028 — that migration must run first.
--
-- Idempotent. Safe to re-run.
-- ────────────────────────────────────────────────────────────────────────────

-- ─── 1. Communities row ────────────────────────────────────────────────────
-- Type 'brand' to match the active rendering path used by the other live
-- brands. (label_meta would arguably fit semantically but is exercised only
-- by the inactive 'street-team' row; staying on 'brand' is safer for V1.)

insert into public.communities (
  slug, display_name, type, tagline,
  accent_from, accent_to, subdomain,
  active, sort_order
) values (
  'jonas-group-ent',
  'Jonas Group Entertainment',
  'brand',
  'Songwriters, artists, catalog. Music Row, Nashville.',
  '#0a0a0a', '#525252',
  'jonasgroupent',
  true,
  0
)
on conflict (slug) do update set
  display_name = excluded.display_name,
  type         = excluded.type,
  tagline      = excluded.tagline,
  accent_from  = excluded.accent_from,
  accent_to    = excluded.accent_to,
  subdomain    = excluded.subdomain,
  active       = true,
  sort_order   = excluded.sort_order;


-- ─── 2. Brand row — full profile ───────────────────────────────────────────
-- Bio uses \n\n for paragraph breaks (rendered with whitespace-pre-line on
-- the brand page). Three paragraphs: what JGE is, divisions + roster, fan
-- invitation. Owner-voice but fan-facing — JGE has its own audience.
--
-- Palette: monochrome (charcoal → slate) per the JGE site's pure black/white
-- visual identity. No "Music Row warm" gold treatment here — that's Nellie's
-- territory; JGE is meant to read clean, label-like, contemporary.
--
-- hero_image points at /brands/jonas-group-ent/hero.png — a 1920x1080
-- composition: brand-palette dark gradient with the white JGE wordmark
-- in the upper third. Sized for the page's object-fit:cover on a 520px
-- min-height hero band, and the lower two-thirds is intentionally empty
-- dark space for the page's title/tagline/CTA overlay to land on.
-- Replace with proper Music Row HQ photography in V2.
--
-- cuisine column is repurposed as free-form sub-category per its 0024
-- comment ("for retail — coffee, books, lifestyle; etc."). Using it to
-- describe JGE's mix of divisions for any future filter UI.
--
-- hours_json left null (label HQ — not a public-walkup business; tour is
-- by-invitation founder reward, not a posted business hours thing).

insert into public.brands (
  slug, name, tagline, bio, hero_image,
  accent_from, accent_to, genres, social,
  active, sort_order,
  category, address, city, state, postal_code, country,
  cuisine, phone, website_url
) values (
  'jonas-group-ent',
  'Jonas Group Entertainment',
  'Songwriters, artists, catalog. Music Row, Nashville.',
  E'Jonas Group Entertainment is a full-service entertainment company on Nashville''s historic Music Row, owned by the Jonas family. We are a label, a publisher, an artist-management group, and a steward of some of the most influential catalogs in country and pop.\n\nUnder our roof: Red Van Records (label), Jonas Group Publishing (songwriter representation and catalog), and a management roster that includes Rhett Akins, Aaron Gillespie, Levi Hummon, RaeLynn, Bailee Madison, Franklin Jonas, Justin Ebach, David Kalmusky, Hunter Hawkins, Amy Stroup, and Dan Marshall. Jonas Group Publishing champions Music Row catalogs through signings, acquisitions, and sync — including the acquired Jonas Brothers catalog.\n\nThis page is for the people who''ve been on our list for years — fans of the artists, friends of the family, and members of the broader Jonas universe. Members get early ticket access for roster shows, listening-party invites, and signed lyric sheets and catalog vinyl from the rewards store. Founders get a private guided tour of our Music Row house at 1600 17th Ave South.',
  '/brands/jonas-group-ent/hero.png',
  '#0a0a0a', '#525252',
  array['All genres','Country','Pop','Rock','Americana']::text[],
  '[
    {"label":"Instagram","href":"https://www.instagram.com/jonasgroupent/"},
    {"label":"Facebook","href":"https://www.facebook.com/jonasgroupent"},
    {"label":"Website","href":"https://www.jonasgroup.com/"}
  ]'::jsonb,
  true, 0,
  'entertainment',
  '1600 17th Ave South',
  'Nashville',
  'TN',
  '37212',
  'US',
  'Management, publishing & label',
  null,
  'https://www.jonasgroup.com/'
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
  website_url  = excluded.website_url;


-- ─── 3. Specials ───────────────────────────────────────────────────────────
-- Re-seedable (delete-then-insert) per 0026's pattern. Tier mix:
--   public: presale access (the headline draw — public to encourage signups)
--   public: member listening parties (drives weekly engagement)
--   premium: songwriter rounds at the HQ (rarer, higher commitment)
--   founder-only: Music Row house tour (signature top-tier perk)
-- No days_of_week / recurrence_rule — these aren't day-of-week recurring;
-- they trigger off release calendars and roster touring.

delete from public.specials where brand_slug = 'jonas-group-ent';

insert into public.specials (
  brand_slug, community_id, title, description,
  days_of_week, recurrence_rule, redemption_code,
  tier, sort_order, active
) values
  (
    'jonas-group-ent', 'jonas-group-ent',
    'Roster Presale Access',
    'Members get a 24-hour ticket presale window for shows by JGE management roster artists — Rhett Akins, RaeLynn, Levi Hummon, Aaron Gillespie, Bailee Madison, Franklin Jonas, and more. Codes drop in the member feed the day before public on-sale.',
    null, null,
    'JGEPRESALE',
    'public', 1, true
  ),
  (
    'jonas-group-ent', 'jonas-group-ent',
    'Member Listening Parties',
    'When a roster artist or Jonas Group Publishing songwriter has a new release, members get the first listen — virtual listening party with the artist or writer joining for Q&A. Roughly monthly, dates announced in the member feed.',
    null, null,
    'JGELISTEN',
    'public', 2, true
  ),
  (
    'jonas-group-ent', 'jonas-group-ent',
    'Songwriter Round at the Nashville HQ',
    'In-person writers'' round at our Music Row house: three writers, acoustic guitars, the stories behind the cuts. Premium members get the seat reservations before the public list opens. Roughly quarterly.',
    null, null,
    'JGEROUND',
    'premium', 3, true
  ),
  (
    'jonas-group-ent', 'jonas-group-ent',
    'Music Row House Tour',
    'A private, after-hours guided tour of the Jonas Group Entertainment house at 1600 17th Ave South — the writer rooms, the offices, the wall of cuts and platinum plaques. Hosted by a JGE staff member. Founders only, by reservation, first Saturday of the month.',
    null, null,
    'JGEHOUSE',
    'founder-only', 4, true
  );


-- ─── 4. Upcoming events ────────────────────────────────────────────────────
-- Same delete-then-insert pattern as specials. Placeholder dates pegged to
-- mid-2026 — refine via admin once real release calendars / room schedules
-- land. Locations point at 1600 17th Ave South for the in-house events;
-- listening parties default to virtual.

delete from public.brand_events where brand_slug = 'jonas-group-ent';

insert into public.brand_events (
  brand_slug, title, detail, event_date,
  starts_at, ends_at,
  location, capacity, sort_order, active, tier
) values
  (
    'jonas-group-ent',
    'New-Release Listening Party — Spring Drop',
    'Virtual listening party for an upcoming Jonas Group Publishing release. Artist joins for Q&A. Members-only Zoom link sent the morning of.',
    'Thursday, May 21 · 7 PM CT',
    '2026-05-21 19:00:00-05',
    '2026-05-21 20:30:00-05',
    'Virtual (member-only link)',
    null, 1, true, 'public'
  ),
  (
    'jonas-group-ent',
    'Songwriter Round at the Music Row House',
    'Three Jonas Group Publishing writers, acoustic guitars, the stories behind the cuts. Limited seating in the JGE house living room. Premium members get the reservation window before the public list opens.',
    'Saturday, June 20 · 7 PM CT',
    '2026-06-20 19:00:00-05',
    '2026-06-20 21:00:00-05',
    'Jonas Group Entertainment, 1600 17th Ave South, Nashville TN',
    40, 2, true, 'premium'
  ),
  (
    'jonas-group-ent',
    'Music Row House Tour — Founders',
    'After-hours guided tour of the JGE house: writer rooms, the offices, the wall of cuts and platinum plaques. Hosted by a JGE staffer. Founders-only, first Saturday of July.',
    'Saturday, July 11 · 5 PM CT',
    '2026-07-11 17:00:00-05',
    '2026-07-11 18:30:00-05',
    'Jonas Group Entertainment, 1600 17th Ave South, Nashville TN',
    12, 3, true, 'public'
  );


-- ─── 5. Smoke-test queries (commented; uncomment to spot-check) ───────────
-- select slug, name, active, tagline, city, category from brands where slug='jonas-group-ent';
-- select title, tier, sort_order from specials where brand_slug='jonas-group-ent' order by sort_order;
-- select title, event_date, tier from brand_events where brand_slug='jonas-group-ent' order by sort_order;
