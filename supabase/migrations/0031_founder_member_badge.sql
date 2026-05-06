-- 0031_founder_member_badge.sql (BEP)
-- Founding-member recognition badge. Auto-awarded by the onboarding API to
-- any member who completes onboarding before 2026-07-15. Will show up
-- alongside their other earned badges on /rewards.

insert into public.badges (slug, name, description, icon, point_value)
values (
  'founder-member',
  'Founding Member',
  'Joined Brand Engage Pro during the founding window (before July 15, 2026).',
  '🏅',
  500
)
on conflict (slug) do nothing;

comment on column public.badges.slug is
  'Stable badge identifier. founder-member is auto-awarded by the onboarding API to members who complete signup before 2026-07-15.';
