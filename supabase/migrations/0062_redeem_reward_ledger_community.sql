-- 0062_redeem_reward_ledger_community.sql
--
-- redeem_reward wrote its spend row to points_ledger without a
-- community_id, so every spend landed under the column default
-- ('raelynn') no matter which brand the reward belonged to. Per-brand
-- ledger views and the cancel_redemption refund lookup (0060) need the
-- real brand.
--
-- The body below is prod's definition as of 2026-09-27 with one change:
-- the ledger insert now sets community_id to the reward's community.
-- Prod had no reward_redemption ledger rows on 2026-09-27, so there is
-- nothing to backfill.

create or replace function public.redeem_reward(
  p_member_id uuid,
  p_reward_id uuid,
  p_delivery_details text default null::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if not v_reward.active then
    raise exception 'Reward is no longer available';
  end if;

  if v_reward.stock is not null and v_reward.stock <= 0 then
    raise exception 'Reward is out of stock';
  end if;

  select * into v_member from members where id = p_member_id;
  if v_member is null then
    raise exception 'Member not found';
  end if;

  if v_member.total_points < v_reward.point_cost then
    raise exception 'Insufficient points';
  end if;

  if v_reward.requires_tier is not null then
    select * into v_membership from member_community_memberships
    where member_id = p_member_id and community_id = v_reward.community_id;

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

  if v_reward.community_id is not null then
    update member_community_memberships
    set total_points = total_points - v_reward.point_cost
    where member_id = p_member_id and community_id = v_reward.community_id;
  end if;

  -- The spend row carries the reward's brand. coalesce keeps the old
  -- column default for a reward with no community (none exist today).
  insert into points_ledger (member_id, delta, source, source_ref, community_id, note)
  values (
    p_member_id,
    -v_reward.point_cost,
    'reward_redemption',
    'redemption:' || v_redemption_id,
    coalesce(v_reward.community_id, 'raelynn'),
    'Redeemed: ' || v_reward.title
  );

  if v_reward.stock is not null then
    update rewards_catalog set stock = stock - 1 where id = p_reward_id;
  end if;

  perform upsert_notification(
    p_member_id,
    'reward_redeemed',
    'Reward redeemed!',
    'You''ve redeemed ' || v_reward.title || '. An brand will fulfill it soon.',
    '/brands/' || v_reward.community_id || '/rewards',
    null,
    'redemption:' || v_redemption_id
  );

  return v_redemption_id;
end $function$;

-- Same grants as 0057: members call it with their session.
revoke execute on function public.redeem_reward(uuid, uuid, text) from public, anon;
grant execute on function public.redeem_reward(uuid, uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
