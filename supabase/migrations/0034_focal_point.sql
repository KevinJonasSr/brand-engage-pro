-- Migration 0034: add hero_focal_x / hero_focal_y to brands.
--
-- Stored as smallint 0..100 (percentage from left/top of the source image).
-- Default 50/50 = centered. Values used by frontend's focalPointStyle()
-- helper to render `object-position: ${x}% ${y}%`.
--
-- Backfill preserves today's hardcoded per-slug overrides so visual
-- rendering is identical at deploy time:
--   nellies → focal_y 100  (was HERO_FOCAL_Y.nellies = "bottom" = 100%)

alter table brands
  add column if not exists hero_focal_x smallint not null default 50
    check (hero_focal_x between 0 and 100),
  add column if not exists hero_focal_y smallint not null default 50
    check (hero_focal_y between 0 and 100);

-- Backfill from current hardcoded overrides.
update brands set hero_focal_y = 100 where slug = 'nellies' and hero_focal_y = 50;

-- Verification query — should show non-default values for nellies and
-- 50/50 for the rest.
-- select slug, name, hero_focal_x, hero_focal_y, active from brands order by sort_order;
