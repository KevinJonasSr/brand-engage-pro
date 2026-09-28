-- 0067_pre_join_points_follow_first_brand.sql
--
-- A member who earns points before joining any brand gets them parked on
-- 'jonas-group' (member_home_community falls back to it). Kevin's call
-- (2026-09-28): those pre-join points belong to the first brand the member
-- joins.
--
-- A prod check on 2026-09-28 found 9 members holding jonas-group points
-- (23 ledger rows, 1,133 points, plus their badges and badge
-- notifications). None of them has a membership yet, so nothing moves
-- today. The move happens when each one joins a brand.
--
-- move_pre_join_points(member, brand) moves the member's jonas-group
-- points_ledger, member_badges and notifications rows to the brand, then
-- adds the moved points to that membership and recomputes its tier.
-- members.total_points already counts these points, so it is not touched.
--   * A ledger row whose (source, source_ref) already exists on the brand
--     stays where it is, so the ledger unique index never trips.
--   * A badge the member already holds on the brand is dropped, since the
--     brand copy wins and was already paid.
--   * If the first brand is jonas-group itself, nothing moves and the
--     parked points are credited to that membership.
--
-- An AFTER INSERT trigger on member_community_memberships calls it only
-- for the member's first membership. Moving the welcome badge before the
-- app awards the brand's welcome badge means award_community_badge hits
-- its on-conflict guard and does not pay the welcome bonus twice.
--
-- The backfill at the end runs the same move for any member who already
-- has a membership and still holds jonas-group rows. It is a no-op today.

create or replace function public.move_pre_join_points(p_member_id uuid, p_community_id text)
returns int
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_points int := 0;
begin
  if p_member_id is null or p_community_id is null then
    return 0;
  end if;

  if p_community_id = 'jonas-group' then
    select coalesce(sum(delta), 0)::int into v_points
      from points_ledger
     where member_id = p_member_id and community_id = 'jonas-group';
  else
    with moved as (
      update points_ledger l
         set community_id = p_community_id
       where l.member_id = p_member_id
         and l.community_id = 'jonas-group'
         and not exists (
           select 1 from points_ledger t
            where t.member_id = l.member_id
              and t.community_id = p_community_id
              and t.source = l.source
              and t.source_ref = l.source_ref)
      returning l.delta
    )
    select coalesce(sum(delta), 0)::int into v_points from moved;

    delete from member_badges b
     where b.member_id = p_member_id
       and b.community_id = 'jonas-group'
       and exists (
         select 1 from member_badges t
          where t.member_id = b.member_id
            and t.badge_slug = b.badge_slug
            and t.community_id = p_community_id);

    update member_badges
       set community_id = p_community_id
     where member_id = p_member_id and community_id = 'jonas-group';

    update notifications
       set community_id = p_community_id
     where member_id = p_member_id and community_id = 'jonas-group';
  end if;

  perform bump_membership_points(p_member_id, p_community_id, v_points);
  return v_points;
end
$function$;

revoke execute on function public.move_pre_join_points(uuid, text) from public, anon, authenticated;
grant execute on function public.move_pre_join_points(uuid, text) to service_role;

create or replace function public.pre_join_points_on_first_membership()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if exists (
    select 1 from member_community_memberships
     where member_id = new.member_id
       and community_id <> new.community_id
  ) then
    return null;
  end if;

  perform move_pre_join_points(new.member_id, new.community_id);
  return null;
end
$function$;

revoke execute on function public.pre_join_points_on_first_membership() from public, anon, authenticated;

drop trigger if exists pre_join_points_on_first_membership on public.member_community_memberships;
create trigger pre_join_points_on_first_membership
  after insert on public.member_community_memberships
  for each row execute function public.pre_join_points_on_first_membership();

-- Backfill: members who already joined a brand but still hold jonas-group
-- rows. Their first brand is member_home_community.
do $$
declare
  r record;
begin
  for r in
    select distinct l.member_id, public.member_home_community(l.member_id) as home
      from public.points_ledger l
     where l.community_id = 'jonas-group'
       and exists (select 1 from public.member_community_memberships m
                    where m.member_id = l.member_id)
  loop
    if r.home <> 'jonas-group' then
      perform public.move_pre_join_points(r.member_id, r.home);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
