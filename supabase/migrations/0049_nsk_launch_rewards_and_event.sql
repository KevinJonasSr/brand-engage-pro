-- NSK launch rewards + Bourbon & Cigar event date correction
-- Adds three launch-day rewards and updates the Bourbon & Cigar event to Sept 3.

-- ── 1. Resolve NSK community_id ──────────────────────────────────────────────
DO $$
DECLARE
  _cid uuid;
BEGIN
  SELECT id INTO _cid FROM public.communities WHERE slug = 'nellies' LIMIT 1;
  IF _cid IS NULL THEN
    RAISE EXCEPTION 'Community nellies not found';
  END IF;

-- ── 2. Welcome Reward — Free Dessert w/ Entree purchase ─────────────────────
  INSERT INTO public.rewards_catalog
    (community_id, title, description, point_cost, kind, stock, active, sort_order, requires_tier)
  VALUES
    (_cid,
     'Free Dessert w/ Entree',
     'Welcome gift for new members. Redeem on your first visit for a complimentary dessert with any entree purchase.',
     0,
     'experience',
     NULL,
     true,
     1,
     'bronze')
  ON CONFLICT DO NOTHING;

-- ── 3. 3-Visit Reward — 1,500 points ($15 value) ────────────────────────────
  INSERT INTO public.rewards_catalog
    (community_id, title, description, point_cost, kind, stock, active, sort_order, requires_tier)
  VALUES
    (_cid,
     '1,500 Bonus Points ($15 Value)',
     'Earn 1,500 bonus points automatically after your 3rd verified visit. Equivalent to $15 in rewards value.',
     0,
     'points',
     NULL,
     true,
     2,
     'bronze')
  ON CONFLICT DO NOTHING;

-- ── 4. Birthday Reward — Free Entree up to $30 ──────────────────────────────
  INSERT INTO public.rewards_catalog
    (community_id, title, description, point_cost, kind, stock, active, sort_order, requires_tier)
  VALUES
    (_cid,
     'Birthday Entree (Up to $30)',
     'Celebrate your birthday month with a complimentary entree up to $30 value. Valid throughout your birthday month — must show member ID.',
     0,
     'experience',
     NULL,
     true,
     3,
     'bronze')
  ON CONFLICT DO NOTHING;

END $$;

-- ── 5. Update Bourbon & Cigar Night to September 3, 2026 ────────────────────
-- Original date was Aug 16 (placeholder). Sept 3 at 7 PM – 10 PM Eastern.
UPDATE public.brand_events
SET
  starts_at = '2026-09-03 23:00:00+00',  -- 7:00 PM ET
  ends_at   = '2026-09-04 02:00:00+00',  -- 10:00 PM ET
  detail    = 'An exclusive evening of premium bourbon pours and hand-selected cigars on the Rooftop. '
           || 'Platinum members receive priority seating; Gold members may request the waitlist. '
           || 'Earn the Bourbon Enthusiast badge upon attendance. '
           || 'Dress smart-casual. Capacity limited to 40 guests.',
  capacity  = 40
WHERE brand_slug = 'nellies'
  AND title = 'Bourbon & Cigar Night';
