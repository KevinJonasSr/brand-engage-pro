-- ============================================================================
-- 0048_nsk_full_program.sql
-- Nellie's Southern Kitchen — Full Rewards Club Program
-- Covers: expanded offers catalog, NSK-specific badges, events, challenges.
-- Safe to re-run (on conflict do nothing / do update throughout).
-- ============================================================================

-- ─── 1. OFFERS — Full Rewards Catalog ───────────────────────────────────────
-- Replaces/extends the starter set from 0037. All slugs are unique so this
-- is additive; existing rows are untouched.

insert into public.offers (community_id, slug, title, description, category, price_points, min_tier, active)
values

  -- ── Entry Level (Bronze, 250–750 pts) ────────────────────────────────────
  ('nellies', 'nsk-complimentary-dessert',
    'Complimentary Dessert',
    'Redeem for any dessert from our current menu on your next dine-in visit.',
    'experience', 500, 'bronze', true),

  ('nellies', 'nsk-nonalcoholic-beverage',
    'Complimentary Non-Alcoholic Beverage',
    'A soft drink, iced tea, lemonade, or house mocktail — on the house.',
    'experience', 250, 'bronze', true),

  ('nellies', 'nsk-seasonal-menu-preview',
    'Seasonal Menu Early Access',
    'Get a sneak peek at our new seasonal menu before it goes live to the public.',
    'digital', 300, 'bronze', true),

  ('nellies', 'nsk-secret-menu-unlock',
    'Secret Menu Item',
    'Unlock a member-only menu item not listed on the public menu. Show your member card to your server.',
    'digital', 400, 'bronze', true),

  ('nellies', 'nsk-recipe-cards',
    'NSK Recipe Card Set',
    'A printed set of family-style recipe cards featuring Nellie''s house favorites.',
    'collectible', 500, 'bronze', true),

  -- ── Mid Tier (Silver, 750–2499 pts) ──────────────────────────────────────
  ('nellies', 'nsk-complimentary-appetizer',
    'Complimentary Appetizer',
    'Biscuits, hush puppies, or the daily featured app — on the house.',
    'experience', 750, 'silver', true),

  ('nellies', 'nsk-signature-cocktail',
    'Signature Cocktail',
    'One complimentary signature cocktail from the current Nellie''s bar menu. Where legally permitted.',
    'experience', 1000, 'silver', true),

  ('nellies', 'nsk-happy-hour-bonus',
    'Happy Hour Bonus Points Day',
    'Earn 2× points on your next Happy Hour visit (Mon–Fri 4–6 PM). Valid one use.',
    'experience', 500, 'silver', true),

  ('nellies', 'nsk-double-points-visit',
    'Double Points — Next Visit',
    'Your next qualifying dine-in visit earns double points. Valid 30 days from redemption.',
    'experience', 750, 'silver', true),

  ('nellies', 'nsk-family-feast-discount',
    'Group Dining Discount — 20% Off',
    '20% off your table total when dining with a group of four or more.',
    'experience', 1500, 'silver', true),

  ('nellies', 'nsk-branded-merch',
    'NSK Branded Merchandise',
    'Choose from a Nellie''s Southern Kitchen apron, mason jar, or canvas tote.',
    'merch', 2000, 'silver', true),

  -- ── Premium Tier (Gold, 3500–7999 pts) ───────────────────────────────────
  ('nellies', 'nsk-complimentary-entree',
    'Complimentary Entrée',
    'One full entrée from the current menu, on us. Dine-in only.',
    'experience', 2500, 'gold', true),

  ('nellies', 'nsk-vip-rooftop-reservation',
    'VIP Rooftop Reservation',
    'Priority seating on the Rooftop — skip the wait list and secure your table.',
    'experience', 3000, 'gold', true),

  ('nellies', 'nsk-sunday-brunch-priority',
    'Sunday Brunch Priority Seating',
    'Reserved table for Sunday Brunch with live music. No wait, no hassle.',
    'experience', 2500, 'gold', true),

  ('nellies', 'nsk-bourbon-tasting-access',
    'Exclusive Bourbon Tasting',
    'Invitation to a members-only bourbon tasting with the Nellie''s team. Limited seats.',
    'experience', 5000, 'gold', true),

  ('nellies', 'nsk-cooking-class',
    'NSK Cooking Class',
    'Learn a signature Nellie''s recipe directly from the kitchen team. Limited to 8 guests.',
    'experience', 5000, 'gold', true),

  ('nellies', 'nsk-private-dining',
    'Private Dining Room',
    'Reserve the private dining room for your celebration. Gold & Platinum members only.',
    'experience', 7500, 'gold', true),

  -- ── Elite Tier (Platinum, 8000+ pts) ─────────────────────────────────────
  ('nellies', 'nsk-dinner-for-two',
    'Dinner for Two',
    'A complimentary dinner for two including two entrées, one appetizer, and two desserts.',
    'experience', 10000, 'platinum', true),

  ('nellies', 'nsk-bourbon-cigar-invite',
    'Invitation-Only Bourbon & Cigar Night',
    'Exclusive invite to our Bourbon & Cigar event. Platinum members only. Includes one featured pour.',
    'experience', 12000, 'platinum', true),

  ('nellies', 'nsk-chefs-table',
    'Chef''s Table Night',
    'An intimate dinner at the chef''s table with the kitchen team. Extremely limited — 4 seats per event.',
    'experience', 15000, 'platinum', true),

  ('nellies', 'nsk-nellies-table-dinner',
    'Nellie''s Table Dinner',
    'Invite-only quarterly private dinner hosted in Nellie''s honor. Platinum members only.',
    'experience', 25000, 'platinum', true)

on conflict (slug) do update set
  title        = excluded.title,
  description  = excluded.description,
  category     = excluded.category,
  price_points = excluded.price_points,
  min_tier     = excluded.min_tier,
  active       = excluded.active;

-- ─── 2. REWARDS CATALOG — same rewards surfaced in the Rewards tab UI ────────
-- rewards_catalog uses point_cost + kind instead of price_points + category.
-- We seed the same items here so both UI surfaces work.

insert into public.rewards_catalog (community_id, title, description, point_cost, kind, active, sort_order)
values
  -- Entry
  ('nellies', 'Complimentary Dessert',              'Any dessert on the menu on your next dine-in visit.',                          500,   'experience',     true, 10),
  ('nellies', 'Complimentary Non-Alcoholic Beverage','Soft drink, iced tea, lemonade, or house mocktail.',                          250,   'experience',     true, 20),
  ('nellies', 'Seasonal Menu Early Access',         'Sneak peek at new seasonal menu items before they go live.',                   300,   'early_access',   true, 30),
  ('nellies', 'Secret Menu Item Unlock',            'Members-only menu item. Show your card to your server.',                       400,   'custom',         true, 40),
  ('nellies', 'NSK Recipe Card Set',                'Printed family-style recipe cards featuring house favorites.',                 500,   'merch_discount', true, 50),
  -- Mid
  ('nellies', 'Complimentary Appetizer',            'Biscuits, hush puppies, or the daily featured appetizer.',                     750,   'experience',     true, 60),
  ('nellies', 'Signature Cocktail',                 'One complimentary signature cocktail. Where legally permitted.',               1000,  'experience',     true, 70),
  ('nellies', 'Happy Hour 2× Points Day',           'Double points on your next Happy Hour visit. One use.',                        500,   'custom',         true, 80),
  ('nellies', 'Double Points — Next Visit',         'Your next dine-in visit earns double points. Valid 30 days.',                  750,   'custom',         true, 90),
  ('nellies', 'Group Dining Discount (20% Off)',    '20% off your table when dining with 4 or more guests.',                       1500,  'merch_discount', true, 100),
  ('nellies', 'NSK Branded Merchandise',            'Apron, mason jar, or canvas tote with the Nellie''s logo.',                   2000,  'custom',         true, 110),
  -- Premium
  ('nellies', 'Complimentary Entrée',               'One full entrée from the current menu, on us.',                               2500,  'experience',     true, 120),
  ('nellies', 'VIP Rooftop Reservation',            'Priority Rooftop seating — skip the wait list.',                              3000,  'experience',     true, 130),
  ('nellies', 'Sunday Brunch Priority Seating',     'Reserved brunch table with live music. No wait.',                             2500,  'experience',     true, 140),
  ('nellies', 'Exclusive Bourbon Tasting',          'Members-only bourbon tasting with the Nellie''s team.',                       5000,  'experience',     true, 150),
  ('nellies', 'NSK Cooking Class',                  'Learn a signature recipe from the kitchen team. 8-person limit.',             5000,  'experience',     true, 160),
  ('nellies', 'Private Dining Room',                'Reserve the private dining room for your celebration.',                       7500,  'experience',     true, 170),
  -- Elite
  ('nellies', 'Dinner for Two',                     'Complimentary dinner for two: 2 entrées, 1 appetizer, 2 desserts.',           10000, 'experience',     true, 180),
  ('nellies', 'Bourbon & Cigar Night (Invite)',     'Exclusive invite to our Bourbon & Cigar event. One featured pour included.',  12000, 'experience',     true, 190),
  ('nellies', 'Chef''s Table Night',                'Intimate dinner at the chef''s table. 4 seats per event.',                   15000, 'experience',     true, 200),
  ('nellies', 'Nellie''s Table Dinner',             'Invite-only quarterly private dinner hosted in Nellie''s honor.',             25000, 'experience',     true, 210)
on conflict do nothing;

-- ─── 3. BADGES — NSK-Specific Achievements ───────────────────────────────────
-- Adds NSK-branded collectible badges on top of the platform-wide set.
-- community_id column may not exist on badges; we use a naming convention
-- (slug prefix 'nsk-') to scope them visually.

insert into public.badges (slug, name, description, icon, point_value, category, threshold, sort_order)
values
  -- Founding & Welcome
  ('nsk-founding-member',     'NSK Founding Member',    'One of the first members to join Nellie''s Rewards Club.',         '🏛️',  100, 'welcome',   null, 100),
  ('nsk-first-visit',         'First Table',            'Checked in at Nellie''s Southern Kitchen for the first time.',      '🍽️',   25, 'welcome',   1,   101),

  -- Dining Milestones
  ('nsk-5-visits',            'Regular',                'Visited Nellie''s 5 times. You know the menu by heart.',            '⭐',   50, 'community', 5,   110),
  ('nsk-10-visits',           'Neighborhood Staple',    '10 visits. Welcome to the family.',                                 '🤝',  150, 'community', 10,  111),
  ('nsk-25-visits',           'Nellie''s Legend',       '25 visits. You''re practically family.',                            '👑',  500, 'community', 25,  112),

  -- Rooftop
  ('nsk-rooftop-regular',     'Rooftop Regular',        'Visited the Rooftop 3 or more times.',                              '🏙️',   75, 'community', 3,   120),
  ('nsk-upstate-ny-night',    'Upstate New York Night', 'Attended Upstate New York Night on the Rooftop.',                   '🗽',   50, 'community', 1,   121),

  -- Brunch
  ('nsk-brunch-club',         'Brunch Club',            'Attended Sunday Brunch with live music. Rise and shine.',           '🥂',   50, 'community', 1,   130),
  ('nsk-brunch-loyalist',     'Brunch Loyalist',        'Joined us for brunch 5 times. Weekend mornings are your thing.',   '🍳',  150, 'community', 5,   131),

  -- Live Music & Entertainment
  ('nsk-live-music-fan',      'Live Music Fan',         'Caught a live music set at Nellie''s.',                             '🎸',   50, 'community', 1,   140),
  ('nsk-live-music-devotee',  'Music Devotee',          'Attended 5 live music events. You love the vibe.',                  '🎵',  200, 'community', 5,   141),
  ('nsk-karaoke-star',        'Karaoke Star',           'Took the mic at Nellie''s Rooftop Karaoke night.',                  '🎤',  100, 'community', 1,   142),

  -- Bourbon & Spirits
  ('nsk-bourbon-enthusiast',  'Bourbon Enthusiast',     'Attended a bourbon tasting or Bourbon & Cigar Night.',              '🥃',  100, 'community', 1,   150),
  ('nsk-whiskey-wednesday',   'Whiskey Wednesday',      'Joined us for Whiskey Wednesday (20% off whiskey).',                '🪙',   25, 'community', 1,   151),
  ('nsk-cocktail-explorer',   'Cocktail Explorer',      'Tried 5 different signature cocktails.',                            '🍹',   75, 'community', 5,   152),

  -- Community & Social
  ('nsk-community-supporter', 'Community Supporter',    'Participated in a Nellie''s community initiative or challenge.',    '💛',   50, 'community', 1,   160),
  ('nsk-google-reviewer',     'Google Reviewer',        'Left a review for Nellie''s on Google. Appreciate you!',            '⭐',   75, 'community', 1,   161),
  ('nsk-social-sharer',       'Social Sharer',          'Tagged Nellie''s in a post or checked in on social media.',         '📸',   25, 'community', 1,   162),
  ('nsk-super-sharer',        'Super Sharer',           'Shared or tagged Nellie''s 5 times. You''re our ambassador.',       '📣',  100, 'community', 5,   163),

  -- Referrals
  ('nsk-table-for-two',       'Table for Two',          'Referred a friend who joined the Rewards Club.',                    '🪑',   75, 'referral',  1,   170),
  ('nsk-party-of-five',       'Party of Five',          'Referred 5 friends to Nellie''s Rewards Club.',                    '🎊',  300, 'referral',  5,   171),

  -- Seasonal & Events
  ('nsk-holiday-guest',       'Holiday Guest',          'Celebrated a holiday at Nellie''s.',                                '🎄',   50, 'community', 1,   180),
  ('nsk-seasonal-explorer',   'Seasonal Explorer',      'Tried items from 4 different seasonal menus.',                      '🍂',  200, 'community', 4,   181),

  -- Elite
  ('nsk-chefs-table-alumni',  'Chef''s Table Alumni',   'Dined at the Chef''s Table. A true Nellie''s experience.',          '👨‍🍳', 250, 'community', 1,   190),
  ('nsk-platinum-guest',      'Platinum Guest',         'Achieved Platinum status at Nellie''s Rewards Club.',               '💎',  500, 'tier',      null, 191)

on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  icon        = excluded.icon,
  point_value = excluded.point_value,
  category    = excluded.category,
  threshold   = excluded.threshold,
  sort_order  = excluded.sort_order;

-- ─── 4. EVENTS — Upcoming & Recurring ────────────────────────────────────────
-- Seeded as upcoming events. Admins can edit dates/details via the admin UI.
-- Recurring events (Happy Hour, Live Music) are seeded for the next occurrence;
-- admin can duplicate as needed.

insert into public.brand_events (
  community_id, title, description, location,
  starts_at, ends_at, capacity, active
)
values

  -- ── Regular Weekly ────────────────────────────────────────────────────────
  ('nellies',
    'Happy Hour — 50% Off Appetizers',
    'Join us Monday through Friday from 4–6 PM for Happy Hour. 50% off all appetizers. Members earn bonus check-in points.',
    'Nellie''s Southern Kitchen — Main Dining Room & Bar',
    now() + interval '1 day',
    now() + interval '1 day' + interval '2 hours',
    null, true),

  ('nellies',
    'Live Music — Rooftop (Thursday)',
    'Live music every Thursday on the Rooftop. Earn bonus points for attending. Upstate New York Night runs alongside this.',
    'Nellie''s Southern Kitchen — Rooftop',
    now() + interval '4 days',
    now() + interval '4 days' + interval '4 hours',
    null, true),

  ('nellies',
    'Live Music — Rooftop (Friday)',
    'Friday night live music on the Rooftop. A perfect way to kick off the weekend.',
    'Nellie''s Southern Kitchen — Rooftop',
    now() + interval '5 days',
    now() + interval '5 days' + interval '4 hours',
    null, true),

  ('nellies',
    'Sunday Brunch with Live Music',
    'Brunch starts at 11 AM with live music. Members with Brunch Club badge earn double check-in points.',
    'Nellie''s Southern Kitchen — Main Dining Room',
    (date_trunc('week', now()) + interval '6 days' + interval '11 hours'),
    (date_trunc('week', now()) + interval '6 days' + interval '15 hours'),
    null, true),

  ('nellies',
    'Whiskey Wednesday',
    '20% off all whiskey bottles. A great night to explore the bar program. Members earn bonus points.',
    'Nellie''s Southern Kitchen — Bar',
    date_trunc('week', now()) + interval '2 days' + interval '17 hours',
    date_trunc('week', now()) + interval '2 days' + interval '22 hours',
    null, true),

  ('nellies',
    'Wine Wednesday — 50% Off Bottles',
    '50% off all wine bottles every Wednesday. Pairs well with good company.',
    'Nellie''s Southern Kitchen — Main Dining Room',
    date_trunc('week', now()) + interval '2 days' + interval '17 hours',
    date_trunc('week', now()) + interval '2 days' + interval '22 hours',
    null, true),

  ('nellies',
    'Del Webb Rooftop Happy Hour',
    'First Tuesday of each month, 4–7 PM. 50% off appetizers on the Rooftop and Patio. Special Del Webb member discount: 15% off food.',
    'Nellie''s Southern Kitchen — Rooftop & Patio',
    date_trunc('month', now() + interval '1 month') + interval '1 week' - interval '7 days'
      + (6 - extract(dow from date_trunc('month', now() + interval '1 month'))::int % 7 + 2) % 7 * interval '1 day'
      + interval '16 hours',
    date_trunc('month', now() + interval '1 month') + interval '1 week' - interval '7 days'
      + (6 - extract(dow from date_trunc('month', now() + interval '1 month'))::int % 7 + 2) % 7 * interval '1 day'
      + interval '19 hours',
    null, true),

  -- ── Featured Upcoming Events ──────────────────────────────────────────────
  ('nellies',
    'Bourbon & Cigar Night',
    'An exclusive evening of premium bourbon pours and hand-selected cigars. Invite-only for Platinum members; Gold members may request waitlist access. Earn the Bourbon Enthusiast badge.',
    'Nellie''s Southern Kitchen — Private Dining Room',
    now() + interval '14 days',
    now() + interval '14 days' + interval '3 hours',
    40, true),

  ('nellies',
    'Rooftop Karaoke Night',
    'Take the mic on the Rooftop. All members welcome — earn the Karaoke Star badge just for participating. Points awarded for check-ins.',
    'Nellie''s Southern Kitchen — Rooftop',
    now() + interval '10 days',
    now() + interval '10 days' + interval '4 hours',
    null, true),

  ('nellies',
    'Upstate New York Night (Rooftop)',
    'Every Thursday — the Rooftop transforms. Earn the Upstate New York Night badge on your first attendance.',
    'Nellie''s Southern Kitchen — Rooftop',
    date_trunc('week', now()) + interval '3 days' + interval '18 hours',
    date_trunc('week', now()) + interval '3 days' + interval '23 hours',
    null, true)

on conflict do nothing;

-- ─── 5. CAMPAIGNS — Monthly Challenges ───────────────────────────────────────
-- Each challenge is a campaign post. Members complete the mission and earn
-- bonus points. brand_slug defaults to 'nellies' for backward compat.

insert into public.campaigns (
  community_id, brand_slug, title, body, cta_label, cta_url, published_at
)
values
  ('nellies', 'nellies',
    '🍳 Brunch Challenge',
    'Visit Sunday Brunch with live music this month and earn 150 bonus points. Check in on the platform after you''re seated to claim your reward. Complete all four Sundays for a surprise bonus.',
    'Log my brunch visit', null,
    now()),

  ('nellies', 'nellies',
    '🏙️ Rooftop Challenge',
    'Hit the Rooftop at least twice this month — any night works. Each check-in earns points, and completing this challenge unlocks the Rooftop Regular badge if you haven''t earned it yet.',
    'Log my rooftop visit', null,
    now()),

  ('nellies', 'nellies',
    '🎸 Live Music Check-in Challenge',
    'Attend any live music night at Nellie''s this month and earn 100 bonus points. Thursday and Friday on the Rooftop, plus Saturday and Sunday in the Dining Room all count.',
    'Log my live music visit', null,
    now()),

  ('nellies', 'nellies',
    '🥃 Featured Cocktail Challenge',
    'Try the featured cocktail of the month and share a photo in the community (tag us on social for bonus points). Members who complete this earn 75 bonus points + the Cocktail Explorer progress.',
    'Log my cocktail', null,
    now()),

  ('nellies', 'nellies',
    '👥 Bring a First-Time Guest',
    'Bring someone who''s never been to Nellie''s and dine together this month. Earn 200 bonus points — and they''ll get a welcome bonus when they join the Rewards Club via your referral link.',
    'Get my referral link', '/referrals',
    now()),

  ('nellies', 'nellies',
    '⭐ Leave a Google Review',
    'Haven''t left us a Google review yet? Do it this month and earn 75 bonus points. Self-report your review in the community with a screenshot — we''ll verify and award points within 48 hours.',
    'I left a review', null,
    now()),

  ('nellies', 'nellies',
    '📸 Tag Us on Social',
    'Post a photo from your Nellie''s visit and tag us on Instagram or Facebook. Self-report it here to earn 25 bonus points per post, up to 3 posts per month (75 pts total).',
    'Report my post', null,
    now())

on conflict do nothing;

-- ─── Smoke-test queries ─────────────────────────────────────────────────────
-- select slug, title, price_points, min_tier from offers where community_id = 'nellies' order by price_points;
-- select slug, name, icon, category from badges where slug like 'nsk-%' order by sort_order;
-- select title, starts_at, capacity from brand_events where community_id = 'nellies' order by starts_at;
-- select title, published_at from campaigns where community_id = 'nellies' order by published_at;
