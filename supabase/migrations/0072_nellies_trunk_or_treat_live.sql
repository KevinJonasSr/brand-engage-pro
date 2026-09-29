-- 0072_nellies_trunk_or_treat_live.sql
--
-- ALREADY APPLIED to prod (enfpviapxvqyoarwwsuf) on 2026-09-29 by direct SQL,
-- at Kevin's direction. This file records the change and is safe to re-run.
--
-- Turns on Nellie's Trunk or Treat event. The date is tentative (Saturday,
-- October 24) and the time is to be announced, so starts_at stays null.
-- Note: with no starts_at, the Nellie's events filter keeps showing it after
-- Oct 24. Set starts_at (or switch it off) once the date and time are final.

update public.brand_events
   set active = true,
       event_date = 'Tentatively Saturday, October 24. Time to be announced.',
       detail = 'Date is tentative. Time to be announced.'
 where brand_slug = 'nellies'
   and title = 'Trunk or Treat';
