-- 0060_cancel_redemption.sql
--
-- Safe reward cancel. Before this, two admin server actions cancelled a
-- redemption by flipping its status and then refunding a point cost the
-- browser sent in. Problems:
--   * a fulfilled or already cancelled redemption could be cancelled again,
--     refunding each time;
--   * the refund amount came from the client, not the stored cost;
--   * members.total_points was refunded read-then-write (racy) and the
--     per-brand membership total was never refunded at all;
--   * the refund ledger row had no community_id, so it landed on the
--     column default instead of the brand the points came from;
--   * the admin rewards path had no community check.
--
-- cancel_redemption() does the whole thing in one transaction:
--   lock the redemption row, require status 'pending', optionally require it
--   to belong to the caller's community, mark it cancelled, write exactly one
--   ledger row for the stored point_cost (no multiplier), then add the same
--   amount back to members.total_points and the brand membership total,
--   and put one unit back on limited stock. This mirrors what
--   redeem_reward() takes away.
--
-- Prod check 2026-09-27: 0 redemptions, 0 refund ledger rows, so the refund
-- unique index below builds cleanly.

-- One refund row per redemption, ever.
create unique index if not exists points_ledger_redemption_refund_unique
  on public.points_ledger (source_ref)
  where source_ref like 'redemption:%:refund';

create or replace function public.cancel_redemption(
  p_redemption_id uuid,
  p_community_id text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_redemption public.reward_redemptions%rowtype;
  v_community text;
begin
  select * into v_redemption
    from public.reward_redemptions
   where id = p_redemption_id
   for update;
  if not found then raise exception 'Redemption not found'; end if;

  if p_community_id is not null
     and v_redemption.community_id is distinct from p_community_id then
    raise exception 'Not authorized for this community';
  end if;

  if v_redemption.status <> 'pending' then
    raise exception 'Only pending redemptions can be cancelled';
  end if;

  perform 1 from public.members where id = v_redemption.member_id for update;

  -- Refund to the brand the reward belongs to. redeem_reward() writes the
  -- spend ledger row without a community_id, so the redemption row is the
  -- reliable source; the spend row is only a fallback.
  v_community := v_redemption.community_id;
  if v_community is null then
    select community_id into v_community
      from public.points_ledger
     where source_ref = 'redemption:' || p_redemption_id
     limit 1;
  end if;
  if v_community is null then
    raise exception 'Cannot tell which community to refund';
  end if;

  update public.reward_redemptions
     set status = 'cancelled', cancelled_at = now()
   where id = p_redemption_id;

  -- Put the unit back. redeem_reward() takes one off limited stock, so the
  -- cancel gives it back; unlimited rewards (stock is null) are untouched.
  update public.rewards_catalog
     set stock = stock + 1
   where id = v_redemption.reward_id
     and stock is not null;

  if v_redemption.point_cost > 0 then
    insert into public.points_ledger (member_id, delta, source, source_ref, community_id, note)
    values (
      v_redemption.member_id,
      v_redemption.point_cost,
      'reward_redemption',
      'redemption:' || p_redemption_id || ':refund',
      v_community,
      'Refunded: redemption cancelled'
    );

    update public.members
       set total_points = coalesce(total_points, 0) + v_redemption.point_cost
     where id = v_redemption.member_id;

    perform public.bump_membership_points(
      v_redemption.member_id, v_community, v_redemption.point_cost
    );
  end if;

  return v_redemption.point_cost;
end $function$;

revoke all on function public.cancel_redemption(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_redemption(uuid, text) to service_role;

notify pgrst, 'reload schema';
