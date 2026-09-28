-- 0061_atomic_member_points.sql
--
-- One atomic way for server code to move a member's point totals.
--
-- Before this, awardPoints, the signup bonus, the referral bonus and the
-- challenge winner bonus all read members.total_points, added in JS, and
-- wrote the sum back. Two awards landing at the same time could overwrite
-- each other and lose points. This function adds in a single UPDATE, then
-- hands the per-brand total to bump_membership_points (which also sets
-- the tier). Pass a null community to move only the member total.
--
-- Service role only: members must never be able to call it.

create or replace function public.add_member_points(
  p_member_id uuid,
  p_delta integer,
  p_community_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_delta is null or p_delta = 0 then
    return;
  end if;

  update members
     set total_points = coalesce(total_points, 0) + p_delta
   where id = p_member_id;

  perform bump_membership_points(p_member_id, p_community_id, p_delta);
end $$;

revoke all on function public.add_member_points(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.add_member_points(uuid, integer, text) to service_role;

notify pgrst, 'reload schema';
