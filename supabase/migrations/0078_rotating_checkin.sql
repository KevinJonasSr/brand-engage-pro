-- 0078_rotating_checkin.sql
--
-- NOT applied to production. Apply this after the PR that adds it merges.
-- Next number after 0077_founder_points_flat.sql.
--
-- Optional rotating check-in QR. Default false, so printed posters
-- (Nellie's, posted 2026-10-11) keep awarding visit points.
-- When true, the static HMAC still opens sign-up but does not award
-- points. Points require a rotating host-stand token.

alter table public.brands
  add column if not exists require_rotating_checkin boolean not null default false;

comment on column public.brands.require_rotating_checkin is
  'When true, the printed static check-in QR still opens sign-up but does not award visit points. Points require the rotating host-stand code.';
