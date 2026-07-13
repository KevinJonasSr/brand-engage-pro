-- ============================================================================
-- 0046_membership_points_sync.sql — engagement points reach visible balance
-- ============================================================================
-- Adds bump_membership_points() and rewrites the six award trigger
-- functions so every engagement action updates member_community_memberships
-- (the UI source of truth read by getCurrentMemberKpis), not just the
-- legacy members.total_points column.
-- Also backfills: every ledger row with a NULL community_id is mapped to
-- its community, summed into membership balances, and stamped.
-- ============================================================================

create or replace function public.bump_membership_points(
  p_member_id uuid, p_community_id text, p_delta int
) returns void
language plpgsql security definer set search_path = public as $$
declare v_tier text;
begin
  if p_community_id is null or p_delta = 0 then return; end if;

  update member_community_memberships
     set total_points = greatest(coalesce(total_points, 0) + p_delta, 0)
   where member_id = p_member_id and community_id = p_community_id;

  if not found then return; end if;

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

-- Rewrite award functions to sync membership balance
create or replace function public.award_community_post_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_award   int     := 5;
  v_multiplier numeric := public.points_multiplier(new.author_id, new.brand_slug);
  award        int     := round(base_award * v_multiplier)::int;
  ref_id       text    := 'community_post:' || new.id::text;
begin
  if not exists (select 1 from points_ledger where source_ref = ref_id) then
    insert into points_ledger (member_id, delta, source, source_ref, community_id, note)
    values (
      new.author_id, award, 'challenge', ref_id, new.brand_slug,
      case when v_multiplier > 1 then 'Community post (premium 1.5x)' else 'Community post' end
    );
    update members set total_points = coalesce(total_points, 0) + award
     where id = new.author_id;
    perform public.bump_membership_points(new.author_id, new.brand_slug, award);
  end if;
  return new;
end $$;

create or replace function public.award_community_comment_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_award   int     := 2;
  v_slug       text;
  v_multiplier numeric;
  award        int;
  ref_id       text    := 'community_comment:' || new.id::text;
begin
  select brand_slug into v_slug from public.community_posts where id = new.post_id;
  v_multiplier := public.points_multiplier(new.author_id, v_slug);
  award        := round(base_award * v_multiplier)::int;

  if not exists (select 1 from points_ledger where source_ref = ref_id) then
    insert into points_ledger (member_id, delta, source, source_ref, community_id, note)
    values (
      new.author_id, award, 'challenge', ref_id, v_slug,
      case when v_multiplier > 1 then 'Community comment (premium 1.5x)' else 'Community comment' end
    );
    update members set total_points = coalesce(total_points, 0) + award
     where id = new.author_id;
    perform public.bump_membership_points(new.author_id, v_slug, award);
  end if;
  return new;
end $$;

create or replace function public.award_poll_vote_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_award   int     := 1;
  v_slug       text;
  v_multiplier numeric;
  award        int;
  ref_id       text    := 'poll_vote:' || new.post_id::text || ':' || new.member_id::text;
begin
  select brand_slug into v_slug from public.community_posts where id = new.post_id;
  v_multiplier := public.points_multiplier(new.member_id, v_slug);
  award        := round(base_award * v_multiplier)::int;

  if not exists (select 1 from points_ledger where source_ref = ref_id) then
    insert into points_ledger (member_id, delta, source, source_ref, community_id, note)
    values (
      new.member_id, award, 'challenge', ref_id, v_slug,
      case when v_multiplier > 1 then 'Poll vote (premium 1.5x)' else 'Poll vote' end
    );
    update members set total_points = coalesce(total_points, 0) + award
     where id = new.member_id;
    perform public.bump_membership_points(new.member_id, v_slug, award);
  end if;
  return new;
end $$;

create or replace function public.award_challenge_entry_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_award   int     := 3;
  v_slug       text;
  v_multiplier numeric;
  award        int;
  ref_id       text    := 'challenge_entry:' || new.id::text;
begin
  select brand_slug into v_slug from public.community_posts where id = new.post_id;
  v_multiplier := public.points_multiplier(new.member_id, v_slug);
  award        := round(base_award * v_multiplier)::int;

  if not exists (select 1 from points_ledger where source_ref = ref_id) then
    insert into points_ledger (member_id, delta, source, source_ref, community_id, note)
    values (
      new.member_id, award, 'challenge', ref_id, v_slug,
      case when v_multiplier > 1 then 'Challenge submission (premium 1.5x)' else 'Challenge submission' end
    );
    update members set total_points = coalesce(total_points, 0) + award
     where id = new.member_id;
    perform public.bump_membership_points(new.member_id, v_slug, award);
  end if;
  return new;
end $$;

create or replace function public.award_event_rsvp_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_award   int     := 10;
  v_slug       text;
  v_multiplier numeric;
  award        int;
  ref_id       text    := 'event_rsvp:' || new.event_id::text || ':' || new.member_id::text;
begin
  select brand_slug into v_slug from public.brand_events where id = new.event_id;
  v_multiplier := public.points_multiplier(new.member_id, v_slug);
  award        := round(base_award * v_multiplier)::int;

  if not exists (select 1 from points_ledger where source_ref = ref_id) then
    insert into points_ledger (member_id, delta, source, source_ref, community_id, note)
    values (
      new.member_id, award, 'event_rsvp', ref_id, v_slug,
      case when v_multiplier > 1 then 'RSVPed to event (premium 1.5x)' else 'RSVPed to event' end
    );
    update members set total_points = coalesce(total_points, 0) + award
     where id = new.member_id;
    perform public.bump_membership_points(new.member_id, v_slug, award);
  end if;
  return new;
end $$;

-- Backfill: stamp community_id on unstamped ledger rows and sync membership balances
with mapped as (
  select l.id, l.member_id, l.delta,
    case
      when l.source_ref like 'community_post:%' then
        (select brand_slug from community_posts where id = split_part(l.source_ref, ':', 2)::uuid)
      when l.source_ref like 'community_comment:%' then
        (select p.brand_slug from community_comments c
           join community_posts p on p.id = c.post_id
          where c.id = split_part(l.source_ref, ':', 2)::uuid)
      when l.source_ref like 'poll_vote:%' then
        (select brand_slug from community_posts where id = split_part(l.source_ref, ':', 2)::uuid)
      when l.source_ref like 'event_rsvp:%' then
        (select brand_slug from brand_events where id = split_part(l.source_ref, ':', 2)::uuid)
      when l.source_ref like 'badge:%' and exists
        (select 1 from communities where slug = split_part(l.source_ref, ':', 3)) then
        split_part(l.source_ref, ':', 3)
    end as community_id
  from points_ledger l
  where l.community_id is null
    and (l.source_ref like 'community_post:%'
      or l.source_ref like 'community_comment:%'
      or l.source_ref like 'event_rsvp:%')
),
sums as (
  select member_id, community_id, sum(delta)::int as total_delta
  from mapped where community_id is not null
  group by member_id, community_id
)
update member_community_memberships m
   set total_points = greatest(coalesce(m.total_points, 0) + s.total_delta, 0)
  from sums s
 where m.member_id = s.member_id and m.community_id = s.community_id;

-- Recompute tiers for touched memberships
update member_community_memberships m
   set current_tier = sub.slug
  from (
    select m2.member_id, m2.community_id,
           (select slug from tiers
             where min_points <= coalesce(m2.total_points, 0)
             order by min_points desc limit 1) as slug
      from member_community_memberships m2
  ) sub
 where m.member_id = sub.member_id and m.community_id = sub.community_id
   and sub.slug is not null
   and m.current_tier is distinct from sub.slug;
