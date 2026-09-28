-- 0063_offers_require_brand.sql
-- Already applied to production via MCP on 2026-09-27.
--
-- Offers must always belong to a brand chosen on purpose. Until now
-- offers.community_id defaulted to 'raelynn', so an offer saved without a
-- brand silently landed on RaeLynn. The admin offers actions now always set
-- community_id (brand admins get their own brand, super-admins must pick one),
-- so the default is removed and a missing brand fails loudly instead.
--
-- Idempotent: dropping a default that is already gone is a no-op.
-- Existing rows are not touched. Rows that were mis-scoped to 'raelynn' in
-- the past need a separate, reviewed data fix.

alter table public.offers alter column community_id drop default;
