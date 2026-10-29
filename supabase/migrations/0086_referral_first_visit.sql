-- 0086: referrals pay on the friend's first visit, and reward both sides.
--
-- Before: the referrer earned 150 pts the moment the friend finished signup
-- (status 'verified' written at insert). Now the onboard route inserts the
-- referral as 'pending' and pays the friend a 50-pt welcome bonus; the first
-- check-in flips the row to 'verified' and pays the referrer.
--
-- `referrals.status` is plain text (0001: "pending | verified | expired", no
-- check constraint, no enum), so no new value is introduced. The lifecycle
-- stays readable by everything that already filters on status = 'verified'
-- (0004 referral badges, 0010/0065 notify_referral_joined, member-home and
-- badge counts). The two timestamps below are the authoritative state:
--
--   referee_bonus_awarded_at  - friend's 50-pt welcome bonus written (signup)
--   qualified_at              - friend's first check-in; referrer paid 150
--
-- Both are idempotent guards alongside the ledger source_refs
-- `referral-welcome:<referred_id>` and `referral-qualified:<referral id>`.

alter table public.referrals
  add column if not exists qualified_at timestamptz;

alter table public.referrals
  add column if not exists referee_bonus_awarded_at timestamptz;

comment on column public.referrals.qualified_at is
  'When the referred member made their first check-in and the referrer was paid. Null = not yet qualified.';
comment on column public.referrals.referee_bonus_awarded_at is
  'When the referred member received the referral welcome bonus at signup.';

-- The first-visit hook looks up the pending row by the new member.
create index if not exists referrals_referred_pending_idx
  on public.referrals (referred_id)
  where referred_id is not null and qualified_at is null;

-- Rows written before this migration were paid at signup under the old
-- rule; mark them qualified so the first-visit hook never pays them twice.
update public.referrals
   set qualified_at = coalesce(verified_at, created_at)
 where status = 'verified'
   and qualified_at is null;
