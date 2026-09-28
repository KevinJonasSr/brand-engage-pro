-- 0066_credit_moved_points.sql
--
-- 0065 moved 34 points_ledger rows off 'raelynn' onto real brands
-- (13 nellies, 21 jonas-group) and did not add them to membership totals.
-- A prod check on 2026-09-28 showed that only 8 of those rows sit in a
-- membership that exists: 4 Nellie's members, each with a welcome badge
-- (25) and a signup bonus (100) written just before they joined, so
-- bump_membership_points found no membership row and did nothing. Their
-- Nellie's check-ins were already counted.
--
-- The other 26 rows belong to members with no membership in that brand
-- (nobody has a jonas-group membership). Kevin's call (2026-09-28): leave
-- those uncounted rather than enroll people in brands they never joined.
--
-- members.total_points already includes these points, so only
-- member_community_memberships changes.
--
-- The fix raises each Nellie's membership that is below its ledger sum up
-- to that sum, then recomputes its tier. Running it again changes nothing.
-- It refuses to run if more memberships are short than the 4 expected.

do $$
declare
  v_short int;
begin
  select count(*) into v_short
    from public.member_community_memberships m
    join (select member_id, community_id, sum(delta) as ledger_sum
            from public.points_ledger
           group by member_id, community_id) l
      on l.member_id = m.member_id and l.community_id = m.community_id
   where coalesce(m.total_points, 0) < l.ledger_sum;

  if v_short > 4 then
    raise exception 'Expected at most 4 short memberships, found %', v_short;
  end if;

  with sums as (
    select member_id, community_id, sum(delta)::int as ledger_sum
      from public.points_ledger
     where community_id = 'nellies'
     group by member_id, community_id
  )
  update public.member_community_memberships m
     set total_points = s.ledger_sum,
         current_tier = coalesce(
           (select t.slug from public.tiers t
             where t.min_points <= s.ledger_sum
             order by t.min_points desc limit 1),
           m.current_tier)
    from sums s
   where m.member_id = s.member_id
     and m.community_id = s.community_id
     and coalesce(m.total_points, 0) < s.ledger_sum;
end $$;
