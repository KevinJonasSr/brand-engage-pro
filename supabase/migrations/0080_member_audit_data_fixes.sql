-- 0080_member_audit_data_fixes.sql
--
-- Data fixes from the 2026-10-29 member experience audit. Idempotent.
--
-- 1. Tier badge copy still carried the Member Engage thresholds seeded in
--    0004 (Silver 2,500 / Gold 10,000 / Platinum 25,000). The real ladder
--    since 0047 is Silver 750 / Gold 3,500 / Platinum 8,000, which is what
--    the Tier Journey card shows. Members saw two different numbers.
-- 2. Nellie's Trunk or Treat (0072) was tentatively Oct 24 with no
--    starts_at, so the past-event filter could not retire it. Switch it off.
-- 3. Test accounts were topping the public leaderboard. Add members.is_test
--    and flag the known walk-test account; app code excludes flagged members
--    from leaderboards.

-- 1. Badge descriptions match the live tier ladder.
update public.badges
   set description = 'Crossed into Silver — 750 pts.'
 where slug = 'tier-silver';

update public.badges
   set description = 'Reached Gold — 3,500 pts. Serious member energy.'
 where slug = 'tier-gold';

update public.badges
   set description = 'Platinum unlocked — 8,000 pts. Elite status.'
 where slug = 'tier-platinum';

-- 2. Retire the past tentative event.
update public.brand_events
   set active = false
 where brand_slug = 'nellies'
   and title = 'Trunk or Treat'
   and starts_at is null;

-- 3. Test-account flag.
alter table public.members
  add column if not exists is_test boolean not null default false;

comment on column public.members.is_test is
  'Staff / QA account. Excluded from public leaderboards and follower counts.';

update public.members
   set is_test = true
 where is_test = false
   and (
     coalesce(first_name, '') ilike 'CS Walk Test%'
     or coalesce(first_name, '') || ' ' || coalesce(last_name, '') ilike '%walk test%'
   );
