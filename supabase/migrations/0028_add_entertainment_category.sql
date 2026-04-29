-- ────────────────────────────────────────────────────────────────────────────
-- 0028_add_entertainment_category.sql
--
-- Extends the `brand_category` enum with 'entertainment'. Required for
-- music/management/label/publishing brands like Jonas Group Entertainment
-- which don't fit the existing restaurant/retail/sports/hotel categories.
--
-- Must be its own migration because Postgres ALTER TYPE ADD VALUE cannot
-- be used in the same transaction that inserts a row using the new value.
-- Run this BEFORE 0029_jonas_group_ent_brand_activate.sql.
-- ────────────────────────────────────────────────────────────────────────────

alter type public.brand_category add value if not exists 'entertainment';
