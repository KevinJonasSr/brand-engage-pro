-- ─────────────────────────────────────────────────────────────────────────────
-- 0037_nsk_jge_rewards.sql
-- Seed initial rewards catalog for Nellie's Southern Kitchen + Jonas Group Ent.
-- on conflict (slug) do nothing makes this safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Nellie's Southern Kitchen ───────────────────────────────────────────────
insert into public.offers (community_id, slug, title, description, category, price_points, min_tier, active)
values
  -- Food & Dining
  ('nellies', 'nsk-free-dessert',       'Free Dessert',                  'Redeem for a complimentary dessert on your next visit.',                                  'experience',  500,    'bronze',   true),
  ('nellies', 'nsk-complimentary-app',  'Complimentary Appetizer',       'Biscuits, hush puppies, or the daily app — on the house.',                                'experience',  750,    'bronze',   true),
  ('nellies', 'nsk-birthday-entree',    'Birthday Entrée',               'Free entrée during your birthday month. Just show your member card.',                     'experience',  0,      'bronze',   true),
  ('nellies', 'nsk-early-dinner',       'Early Dinner Priority Seating', 'Reserved seating during the early dinner window — skip the queue.',                       'experience',  1000,   'bronze',   true),
  ('nellies', 'nsk-free-entree',        'Free Entrée',                   'Stamp card reward — redeem after qualifying check-ins for a full entrée on us.',          'experience',  2000,   'silver',   true),
  ('nellies', 'nsk-family-feast',       'Family Feast Discount',         '20% off your table when dining with a group of four or more.',                            'experience',  1500,   'silver',   true),
  -- Experience
  ('nellies', 'nsk-sunday-brunch',      'Sunday Brunch Priority Seating','Skip the brunch wait list and secure your table before doors open.',                      'experience',  2500,   'gold',     true),
  ('nellies', 'nsk-cooking-class',      'Cooking Class',                 'Learn a signature NSK recipe directly from the kitchen team. Limited seats.',              'experience',  5000,   'gold',     true),
  ('nellies', 'nsk-private-dining',     'Private Dining Room Access',    'Reserve the private dining room for your celebration. Gold & Platinum only.',              'experience',  7500,   'gold',     true),
  ('nellies', 'nsk-chefs-table',        'Chef''s Table Night',           'An intimate dinner at the chef''s table with the kitchen team. Extremely limited.',        'experience',  15000,  'platinum', true),
  ('nellies', 'nsk-nellies-table',      'Nellie''s Table Dinner',        'Invite-only quarterly private dinner. Platinum members only. Hosted in Nellie''s honor.',  'experience',  25000,  'platinum', true),
  -- Merch
  ('nellies', 'nsk-branded-merch',      'NSK Branded Merch',             'Choose from an apron, mason jar, or tote bag with the Nellie''s Southern Kitchen logo.',  'merch',       3000,   'bronze',   true),
  ('nellies', 'nsk-recipe-cards',       'Recipe Card Set',               'Printed family-style recipe cards featuring NSK house favorites.',                        'collectible', 2000,   'bronze',   true),
  -- Digital
  ('nellies', 'nsk-seasonal-access',    'Seasonal Menu Early Access',    'Get a sneak peek at new seasonal menu items before they go live.',                        'digital',     500,    'bronze',   true),
  ('nellies', 'nsk-member-menu-item',   'Member-Only Menu Item',         'Unlock a secret menu item not listed on the public menu.',                                'digital',     1000,   'bronze',   true)
on conflict (slug) do nothing;

-- ─── Jonas Group Entertainment ───────────────────────────────────────────────
insert into public.offers (community_id, slug, title, description, category, price_points, min_tier, active)
values
  -- Access & Experiences
  ('jonas-group-ent', 'jge-soundcheck',         'Soundcheck Access',             'Watch a JGE artist''s pre-show soundcheck. Limited spots per event.',                        'experience',  5000,   'gold',     true),
  ('jonas-group-ent', 'jge-vip-suite',          'VIP Suite Experience',          'VIP suite access at a concert or sports event. Gold & Platinum only.',                       'experience',  10000,  'gold',     true),
  ('jonas-group-ent', 'jge-studio-session',     'Studio Session Observer Pass',  'Sit in on a live recording session at a JGE studio.',                                        'experience',  15000,  'gold',     true),
  ('jonas-group-ent', 'jge-listening-party',    'Artist Listening Party',        'First-listen event for a new JGE release. Members only, before public streaming.',           'experience',  7500,   'gold',     true),
  ('jonas-group-ent', 'jge-leader-live',        'Leader Live Experience',        'Exclusive access to a Leader Live event — an intimate JGE-hosted performance series.',       'experience',  12000,  'gold',     true),
  ('jonas-group-ent', 'jge-meet-greet',         'Meet & Greet Upgrade',          'Backstage or post-show access with a JGE artist. Platinum only.',                           'experience',  25000,  'platinum', true),
  ('jonas-group-ent', 'jge-signed-memorabilia', 'Signed Memorabilia',            'Autographed vinyl, photo, or setlist from a JGE artist.',                                   'collectible', 8000,   'platinum', true),
  -- Tickets & Events
  ('jonas-group-ent', 'jge-presale-code',       'Exclusive Pre-Sale Code',       '48-hour head start on ticket purchases before public on-sale.',                              'ticket',      500,    'bronze',   true),
  ('jonas-group-ent', 'jge-presale-window',     'Priority Ticket Window',        'Get first access to purchase tickets 48 hours before they go on sale publicly.',             'ticket',      750,    'bronze',   true),
  ('jonas-group-ent', 'jge-ticket-discount',    'Discounted Tickets',            '15% off face value on tickets to JGE-affiliated shows and events.',                         'ticket',      1500,   'silver',   true),
  ('jonas-group-ent', 'jge-showcase-ticket',    'Free Showcase Ticket',          'Free ticket to a smaller JGE showcase event as a tier milestone reward.',                   'ticket',      3000,   'silver',   true),
  ('jonas-group-ent', 'jge-ticket-upgrade',     'Free Ticket Upgrade',           'Upgrade from GA to VIP or floor for an upcoming event. Gold & Platinum only.',              'ticket',      5000,   'gold',     true),
  ('jonas-group-ent', 'jge-annual-gala',        'Annual Gala Invitation',        'Invitation to the Jonas Group year-end celebration gala. Platinum only.',                   'ticket',      20000,  'platinum', true),
  -- Digital & Fan Content
  ('jonas-group-ent', 'jge-early-release',      'Early Music Release',           'Listen to new JGE artist releases 24–48 hours before public streaming.',                   'digital',     500,    'bronze',   true),
  ('jonas-group-ent', 'jge-exclusive-content',  'Exclusive Content Drop',        'Access to unreleased tracks, behind-the-scenes footage, and artist updates.',              'digital',     1000,   'silver',   true),
  ('jonas-group-ent', 'jge-fan-qa',             'Fan-to-Artist Q&A',             'Join a live or recorded Q&A session with a JGE artist. Members only.',                     'digital',     3000,   'silver',   true),
  ('jonas-group-ent', 'jge-digital-collectible','Digital Art Collectible',        'Limited-edition artist visual — a numbered digital print exclusive to BEP members.',       'digital',     5000,   'gold',     true),
  ('jonas-group-ent', 'jge-video-shoutout',     'Personal Video Shoutout',       'A personalized video message from a JGE artist, just for you.',                            'digital',     25000,  'platinum', true),
  -- Merchandise
  ('jonas-group-ent', 'jge-signed-vinyl',       'Signed Vinyl or CD',            'Artist-autographed vinyl record or CD from the JGE catalog. Limited run.',                 'collectible', 6000,   'silver',   true),
  ('jonas-group-ent', 'jge-exclusive-apparel',  'Exclusive Apparel Drop',        'Members-only merch purchaseable only with points — not available in any store.',           'merch',       4000,   'silver',   true),
  ('jonas-group-ent', 'jge-photo-print',        'Artist Photography Print',      'Limited-edition, numbered fine-art print of an official JGE artist photo.',                'collectible', 7500,   'gold',     true),
  ('jonas-group-ent', 'jge-tour-laminate',      'Tour Laminate / Credential',    'Commemorative replica tour laminate — the superfan badge of honor.',                       'collectible', 3500,   'bronze',   true)
on conflict (slug) do nothing;
