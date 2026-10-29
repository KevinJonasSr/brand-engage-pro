-- 0082_lifetime_points_tier.sql
--
-- Tier is earned, not held: it follows lifetime points earned, and spending
-- never demotes.
--
-- Problem. redeem_reward (0070) subtracts the reward cost from
-- members.total_points and member_community_memberships.total_points.
-- members_update_tier (0004) recomputes members.current_tier from
-- total_points on every update, and bump_membership_points (0070) does the
-- same for the brand membership on the next award. A Silver member who
-- redeemed a reward dropped back to Bronze.
--
-- Approach: a stored `lifetime_points` column on both tables, not a
-- SUM(delta) WHERE delta > 0 view over points_ledger. Reasons:
--   * The existing tier design is trigger-driven off a column on the row
--     (0004, 0070). A column keeps that shape; a ledger aggregate would have
--     to be re-run inside every award path.
--   * Not every grant reached the ledger. The streak bonus wrote
--     members.total_points directly until the app change that ships with
--     this migration, and early welcome/badge bonuses were inconsistent, so
--     SUM(positive deltas) under-counts some members and would demote them
--     on first recompute. The backfill below floors lifetime at the current
--     total and at the current tier's threshold so nobody moves down.
--   * It is kept current by a trigger on total_points itself, so every
--     writer is covered without editing each of them: add_member_points
--     (0061), the Nellie's 3-visit trigger (0075), the welcome bonus
--     (0052/0058), the pre-join move (0067) and cancel_redemption refunds.
--     Any positive change to total_points adds the same amount to
--     lifetime_points; decrements (redemptions) leave it alone.
--
-- Tier rules after this migration:
--   * members.current_tier and memberships.current_tier are computed from
--     lifetime_points, and only ever move up.
--   * bump_membership_points no longer sets the tier itself; the new
--     membership trigger does, from lifetime_points.
--   * The app (lib/data/member.ts getCurrentMemberKpis) computes tier
--     progress from lifetime points and keeps the wallet on the net balance.
--
-- No enum changes. Idempotent: safe to re-run.

-- ------------------------------------------------------------ 1. columns
alter table public.members
  add column if not exists lifetime_points integer not null default 0;

alter table public.member_community_memberships
  add column if not exists lifetime_points integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'members_lifetime_points_nonneg'
      and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_lifetime_points_nonneg check (lifetime_points >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'member_community_memberships_lifetime_points_nonneg'
      and conrelid = 'public.member_community_memberships'::regclass
  ) then
    alter table public.member_community_memberships
      add constraint member_community_memberships_lifetime_points_nonneg
      check (lifetime_points >= 0);
  end if;
end $$;

-- ------------------------------------------------------ 2. member trigger
-- Replaces update_member_tier (0004). Fires before insert and before any
-- update that names total_points or lifetime_points. Accrues lifetime from
-- positive total_points movement, then promotes (never demotes) the tier.
create or replace function public.update_member_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_tier tier_slug;
  v_new_min integer;
  v_cur_min integer;
begin
  if tg_op = 'INSERT' then
    -- A row created with points already on it (seed, import) starts with
    -- that much lifetime.
    new.lifetime_points := greatest(coalesce(new.lifetime_points, 0), coalesce(new.total_points, 0));
  else
    if coalesce(new.total_points, 0) > coalesce(old.total_points, 0) then
      new.lifetime_points := coalesce(new.lifetime_points, 0)
        + (coalesce(new.total_points, 0) - coalesce(old.total_points, 0));
    end if;
    -- Lifetime only grows.
    new.lifetime_points := greatest(coalesce(new.lifetime_points, 0), coalesce(old.lifetime_points, 0));
  end if;

  select slug, min_points into v_new_tier, v_new_min
    from tiers
   where min_points <= coalesce(new.lifetime_points, 0)
   order by min_points desc
   limit 1;

  if v_new_tier is not null and v_new_tier <> new.current_tier then
    select min_points into v_cur_min from tiers where slug = new.current_tier;
    if v_cur_min is null or v_new_min > v_cur_min then
      new.current_tier := v_new_tier;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists members_update_tier on public.members;
create trigger members_update_tier
  before insert or update of total_points, lifetime_points on public.members
  for each row execute function public.update_member_tier();

-- -------------------------------------------------- 3. membership trigger
-- Same rule for the per-brand row. Takes over the tier write that
-- bump_membership_points (0046/0070) used to do from total_points.
create or replace function public.update_membership_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_tier tier_slug;
  v_new_min integer;
  v_cur_min integer;
begin
  if tg_op = 'INSERT' then
    new.lifetime_points := greatest(coalesce(new.lifetime_points, 0), coalesce(new.total_points, 0));
  else
    if coalesce(new.total_points, 0) > coalesce(old.total_points, 0) then
      new.lifetime_points := coalesce(new.lifetime_points, 0)
        + (coalesce(new.total_points, 0) - coalesce(old.total_points, 0));
    end if;
    new.lifetime_points := greatest(coalesce(new.lifetime_points, 0), coalesce(old.lifetime_points, 0));
  end if;

  select slug, min_points into v_new_tier, v_new_min
    from tiers
   where min_points <= coalesce(new.lifetime_points, 0)
   order by min_points desc
   limit 1;

  if v_new_tier is not null and v_new_tier is distinct from new.current_tier then
    select min_points into v_cur_min from tiers where slug = new.current_tier;
    if v_cur_min is null or v_new_min > v_cur_min then
      new.current_tier := v_new_tier;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists memberships_update_tier on public.member_community_memberships;
create trigger memberships_update_tier
  before insert or update of total_points, lifetime_points on public.member_community_memberships
  for each row execute function public.update_membership_tier();

-- -------------------------------------------- 4. bump_membership_points
-- Signature unchanged (add_member_points, the Nellie's trigger and
-- cancel_redemption all call it). It only moves the balance now; the
-- trigger above handles lifetime and tier.
create or replace function public.bump_membership_points(p_member_id uuid, p_community_id text, p_delta int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_community_id is null or p_delta = 0 then
    return;
  end if;

  update member_community_memberships
     set total_points = greatest(coalesce(total_points, 0) + p_delta, 0)
   where member_id = p_member_id and community_id = p_community_id;
end $$;

revoke all on function public.bump_membership_points(uuid, text, int) from public, anon, authenticated;
grant execute on function public.bump_membership_points(uuid, text, int) to service_role;

-- ------------------------------------------------------------ 5. backfill
-- lifetime = max(positive ledger deltas, current balance, current tier's
-- threshold). The explicit SET of lifetime_points fires the triggers above,
-- which promote anyone whose lifetime already clears a higher tier.
with earned as (
  select member_id, sum(delta)::integer as pts
    from public.points_ledger
   where delta > 0
   group by member_id
),
target as (
  select m.id,
         greatest(
           coalesce(e.pts, 0),
           coalesce(m.total_points, 0),
           coalesce(t.min_points, 0)
         ) as lifetime
    from public.members m
    left join earned e on e.member_id = m.id
    left join public.tiers t on t.slug = m.current_tier
)
update public.members m
   set lifetime_points = x.lifetime
  from target x
 where x.id = m.id
   and coalesce(m.lifetime_points, 0) < x.lifetime;

with earned as (
  select member_id, community_id, sum(delta)::integer as pts
    from public.points_ledger
   where delta > 0 and community_id is not null
   group by member_id, community_id
),
target as (
  select mm.member_id, mm.community_id,
         greatest(
           coalesce(e.pts, 0),
           coalesce(mm.total_points, 0),
           coalesce(t.min_points, 0)
         ) as lifetime
    from public.member_community_memberships mm
    left join earned e
      on e.member_id = mm.member_id and e.community_id = mm.community_id
    left join public.tiers t on t.slug = mm.current_tier
)
update public.member_community_memberships mm
   set lifetime_points = x.lifetime
  from target x
 where x.member_id = mm.member_id and x.community_id = mm.community_id
   and coalesce(mm.lifetime_points, 0) < x.lifetime;

-- Members cannot write this column: 0051's allow-list trigger already
-- rejects any column it does not name, and UPDATE on members is column-
-- granted. Nothing to add here.

notify pgrst, 'reload schema';
