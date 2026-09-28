-- 0070_redeem_member_lock_and_fraud_policy.sql
--
-- Brand Engage: three fixes found by the live tests in supabase/tests/live.
--
-- 1. bump_membership_points (0046) declared v_tier as text, but
--    member_community_memberships.current_tier is the enum tier_slug. The
--    comparison "current_tier is distinct from v_tier" then fails with
--    42883 (operator does not exist: tier_slug = text). Every non-zero
--    point award for a member who already belongs to that brand has been
--    failing since 0046: award functions, cancel_redemption refunds and the
--    0067 pre-join point move. Fix: declare v_tier as tier_slug.
--
-- 2. redeem_reward (last defined in 0065) locked the reward row but not the
--    member row, so two redemptions at the same instant could both pass the
--    balance check and push a member below 0. It now locks the member row
--    (and the brand membership row) before checking the balance. The brand
--    membership total is floored at 0, the same way bump_membership_points
--    floors it, since members.total_points is the balance that is checked.
--    CHECK (total_points >= 0) on both tables backs this up. No rows were
--    negative when this was written (checked on prod 2026-09-28).
--
-- 3. fraud_signals_super_admin_all let any admin_users row through, so a
--    brand admin scoped to one brand could read and edit fraud signals for
--    every member. It now requires a super admin row (community_id = '*').
--    The policy was created outside the migrations folder, so it is dropped
--    with "if exists" and created again here.

-- ------------------------------------------------------------------ 1
create or replace function public.bump_membership_points(p_member_id uuid, p_community_id text, p_delta int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier tier_slug;
begin
  if p_community_id is null or p_delta = 0 then
    return;
  end if;

  update member_community_memberships
     set total_points = greatest(coalesce(total_points, 0) + p_delta, 0)
   where member_id = p_member_id and community_id = p_community_id;
  if not found then
    return;
  end if;

  select t.slug into v_tier
    from tiers t
    join member_community_memberships m
      on m.member_id = p_member_id and m.community_id = p_community_id
   where t.min_points <= m.total_points
   order by t.min_points desc
   limit 1;

  if v_tier is not null then
    update member_community_memberships
       set current_tier = v_tier
     where member_id = p_member_id and community_id = p_community_id
       and current_tier is distinct from v_tier;
  end if;
end $$;

revoke all on function public.bump_membership_points(uuid, text, int) from public, anon, authenticated;
grant execute on function public.bump_membership_points(uuid, text, int) to service_role;

-- ------------------------------------------------------------------ 2
create or replace function public.redeem_reward(p_member_id uuid, p_reward_id uuid, p_delivery_details text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member members%rowtype;
  v_reward rewards_catalog%rowtype;
  v_membership member_community_memberships%rowtype;
  v_redemption_id uuid;
  v_role text := auth.role();
begin
  if v_role = 'authenticated' then
    if auth.uid() is distinct from p_member_id then
      raise exception 'Cannot redeem for another member' using errcode = '42501';
    end if;
  elsif v_role = 'anon' then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_reward from rewards_catalog where id = p_reward_id
  for update;

  if v_reward is null then
    raise exception 'Reward not found';
  end if;

  if v_reward.community_id is null then
    raise exception 'Reward has no brand';
  end if;

  if not v_reward.active then
    raise exception 'Reward is no longer available';
  end if;

  if v_reward.stock is not null and v_reward.stock <= 0 then
    raise exception 'Reward is out of stock';
  end if;

  -- Lock the member row so a second redemption waits here and then sees
  -- the lowered balance.
  select * into v_member from members where id = p_member_id
  for update;
  if v_member is null then
    raise exception 'Member not found';
  end if;

  select * into v_membership from member_community_memberships
   where member_id = p_member_id and community_id = v_reward.community_id
  for update;

  if v_member.total_points < v_reward.point_cost then
    raise exception 'Insufficient points';
  end if;

  if v_reward.requires_tier is not null then
    if v_membership is null then
      raise exception 'Not a member of this community';
    end if;

    if v_reward.requires_tier = 'premium' and v_membership.subscription_tier != 'premium' then
      raise exception 'Premium membership required';
    end if;

    if v_reward.requires_tier = 'founder-only' and v_membership.subscription_tier != 'founder' then
      raise exception 'Founder status required';
    end if;
  end if;

  insert into reward_redemptions (member_id, reward_id, community_id, point_cost, delivery_details, status)
  values (p_member_id, p_reward_id, v_reward.community_id, v_reward.point_cost, p_delivery_details, 'pending')
  returning id into v_redemption_id;

  update members set total_points = total_points - v_reward.point_cost
  where id = p_member_id;

  update member_community_memberships
  set total_points = greatest(total_points - v_reward.point_cost, 0)
  where member_id = p_member_id and community_id = v_reward.community_id;

  -- The spend row carries the reward's brand.
  insert into points_ledger (member_id, delta, source, source_ref, community_id, note)
  values (
    p_member_id,
    -v_reward.point_cost,
    'reward_redemption',
    'redemption:' || v_redemption_id,
    v_reward.community_id,
    'Redeemed: ' || v_reward.title
  );

  if v_reward.stock is not null then
    update rewards_catalog set stock = stock - 1 where id = p_reward_id;
  end if;

  perform upsert_notification(
    p_member_id,
    'reward_redeemed',
    'Reward redeemed!',
    'You''ve redeemed ' || v_reward.title || '. The brand will fulfill it soon.',
    '/brands/' || v_reward.community_id || '/rewards',
    null,
    'redemption:' || v_redemption_id,
    v_reward.community_id
  );

  return v_redemption_id;
end $$;

revoke all on function public.redeem_reward(uuid, uuid, text) from public, anon;
grant execute on function public.redeem_reward(uuid, uuid, text) to authenticated, service_role;

alter table public.members
  add constraint members_total_points_nonneg check (total_points >= 0);
alter table public.member_community_memberships
  add constraint member_community_memberships_total_points_nonneg check (total_points >= 0);

-- ------------------------------------------------------------------ 3
-- Fresh builds only: fraud_signals was created on prod outside the
-- migrations folder. Same shape as prod (2026-09-28). No-op on prod.
create table if not exists public.fraud_signals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  verdict text not null check (verdict in ('legitimate', 'suspicious', 'unclear')),
  confidence numeric not null default 0,
  triggers text[] not null default '{}',
  reasons text[] not null default '{}',
  evidence_json jsonb,
  status text not null default 'pending' check (status in ('pending', 'dismissed', 'confirmed')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.fraud_signals enable row level security;
create index if not exists idx_fraud_signals_pending
  on public.fraud_signals (status, scanned_at desc) where status = 'pending';
create index if not exists idx_fraud_signals_member
  on public.fraud_signals (member_id);

drop policy if exists fraud_signals_super_admin_all on public.fraud_signals;
create policy fraud_signals_super_admin_all on public.fraud_signals
  for all
  using (exists (
    select 1 from public.admin_users au
     where au.user_id = auth.uid() and au.community_id = '*'
  ))
  with check (exists (
    select 1 from public.admin_users au
     where au.user_id = auth.uid() and au.community_id = '*'
  ));
