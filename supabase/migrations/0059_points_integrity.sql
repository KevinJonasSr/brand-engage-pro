-- 0059_points_integrity.sql
--
-- Points integrity guards. Written against prod state checked 2026-09-27:
-- no existing rows break any of the constraints below.
--
-- 1. One ledger row per (member, community, source, source_ref).
--    Not a global unique on source_ref: anniversary rows use the milestone
--    key as source_ref, which is shared across members by design.
-- 2. One referral row per referred member (already in prod as an ad hoc
--    index; recorded here so fresh databases match).
-- 3. Members can no longer write referrals or check-ins straight through
--    PostgREST. Both are written only by server code with the service role.
-- 4. A check-in must name a real brand.

-- 1. Ledger idempotency --------------------------------------------------
create unique index if not exists points_ledger_member_source_ref_unique
  on public.points_ledger (member_id, community_id, source, source_ref)
  where source_ref is not null;

-- 2. One referral per referred member -------------------------------------
create unique index if not exists referrals_referred_unique
  on public.referrals (referred_id)
  where referred_id is not null;

-- 3. Remove member self-insert paths --------------------------------------
drop policy if exists referrals_self_insert on public.referrals;

drop policy if exists "Members can insert own checkins" on public.checkins;
revoke insert on table public.checkins from authenticated;

-- 4. Check-ins must reference a real brand --------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'checkins_brand_slug_fkey'
      and conrelid = 'public.checkins'::regclass
  ) then
    alter table public.checkins
      add constraint checkins_brand_slug_fkey
      foreign key (brand_slug) references public.brands (slug)
      on update cascade on delete restrict;
  end if;
end $$;

notify pgrst, 'reload schema';
