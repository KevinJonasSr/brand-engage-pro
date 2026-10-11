-- 0077_founder_points_flat.sql
--
-- NOT applied yet. Numbered 0077 because 0075 is reserved for another PR.
-- Renumber this and 0076 together if that migration lands first.
--
-- Founder points (0074) stacked with Premium, so a founder on Premium earned
-- 2x, and every bonus was labeled "premium 1.5x". Premium sales are closed.
-- Founders now earn a flat 1.5x (Premium does not stack on top). A Premium
-- member who is not a founder still earns 1.5x. Ledger rows for founders
-- say "Founder 1.5x". Existing ledger rows are not rewritten.
--
-- QR check-in points are awarded in frontend/lib/data/checkins.ts (there is
-- no base-points trigger on checkins). That path uses the same flat 1.5x.
-- The three-visit bonus trigger is intentionally not changed here.
--
-- Mirrors frontend/lib/founder-perks.ts (pointsMultiplier, ledgerNote).

create or replace function public.points_multiplier(
  p_member_id    uuid,
  p_community_id text
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_founder(p_member_id, p_community_id) then 1.5
    when public.is_premium(p_member_id, p_community_id) then 1.5
    else 1.0
  end;
$$;

-- Post, comment and RSVP were last defined in 0046. Only the note changes.
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
      case
        when public.is_founder(new.author_id, new.brand_slug) then 'Community post (Founder 1.5x)'
        when v_multiplier > 1 then 'Community post (premium 1.5x)'
        else 'Community post'
      end
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
      case
        when public.is_founder(new.author_id, v_slug) then 'Community comment (Founder 1.5x)'
        when v_multiplier > 1 then 'Community comment (premium 1.5x)'
        else 'Community comment'
      end
    );
    update members set total_points = coalesce(total_points, 0) + award
     where id = new.author_id;
    perform public.bump_membership_points(new.author_id, v_slug, award);
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
      case
        when public.is_founder(new.member_id, v_slug) then 'RSVPed to event (Founder 1.5x)'
        when v_multiplier > 1 then 'RSVPed to event (premium 1.5x)'
        else 'RSVPed to event'
      end
    );
    update members set total_points = coalesce(total_points, 0) + award
     where id = new.member_id;
    perform public.bump_membership_points(new.member_id, v_slug, award);
  end if;
  return new;
end $$;

-- Poll, challenge and CTA were last defined in 0065 (community fallback).
create or replace function public.award_challenge_entry_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  base_award   int     := 3;
  v_slug       text;
  v_community  text;
  v_multiplier numeric;
  award        int;
  ref_id       text    := 'challenge_entry:' || new.id::text;
begin
  select brand_slug into v_slug from public.community_posts where id = new.post_id;
  v_community  := coalesce(v_slug, public.member_home_community(new.member_id));
  v_multiplier := public.points_multiplier(new.member_id, v_slug);
  award        := round(base_award * v_multiplier)::int;

  if not exists (select 1 from points_ledger where source_ref = ref_id) then
    insert into points_ledger (member_id, delta, source, source_ref, community_id, note)
    values (
      new.member_id, award, 'challenge', ref_id, v_community,
      case
        when public.is_founder(new.member_id, v_slug) then 'Challenge submission (Founder 1.5x)'
        when v_multiplier > 1 then 'Challenge submission (premium 1.5×)'
        else 'Challenge submission'
      end
    );

    update members
       set total_points = coalesce(total_points, 0) + award
     where id = new.member_id;

    perform public.bump_membership_points(new.member_id, v_community, award);
  end if;
  return new;
end $function$;

create or replace function public.award_poll_vote_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  base_award   int     := 1;
  v_slug       text;
  v_community  text;
  v_multiplier numeric;
  award        int;
  ref_id       text    := 'poll_vote:' || new.post_id::text || ':' || new.member_id::text;
begin
  select brand_slug into v_slug from public.community_posts where id = new.post_id;
  v_community  := coalesce(v_slug, public.member_home_community(new.member_id));
  v_multiplier := public.points_multiplier(new.member_id, v_slug);
  award        := round(base_award * v_multiplier)::int;

  if not exists (select 1 from points_ledger where source_ref = ref_id) then
    insert into points_ledger (member_id, delta, source, source_ref, community_id, note)
    values (
      new.member_id, award, 'challenge', ref_id, v_community,
      case
        when public.is_founder(new.member_id, v_slug) then 'Poll vote (Founder 1.5x)'
        when v_multiplier > 1 then 'Poll vote (premium 1.5×)'
        else 'Poll vote'
      end
    );

    update members
       set total_points = coalesce(total_points, 0) + award
     where id = new.member_id;

    perform public.bump_membership_points(new.member_id, v_community, award);
  end if;
  return new;
end $function$;

create or replace function public.award_member_action_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_base        int;
  v_slug        text;
  v_community   text;
  v_multiplier  numeric;
  v_award       int;
  v_ref         text;
  v_is_premium  boolean;
begin
  select point_value, brand_slug into v_base, v_slug
    from member_actions where id = new.action_id;
  if v_base is null or v_base <= 0 then return new; end if;

  if v_slug is null then
    v_multiplier := 1.0;
    v_is_premium := false;
  else
    v_multiplier := public.points_multiplier(new.member_id, v_slug);
    v_is_premium := v_multiplier > 1;
  end if;
  v_community := coalesce(v_slug, public.member_home_community(new.member_id));

  v_award := round(v_base * v_multiplier)::int;
  v_ref   := 'member_action:' || new.action_id::text || ':' || new.member_id::text;

  if not exists (select 1 from points_ledger where source_ref = v_ref) then
    insert into points_ledger (member_id, delta, source, source_ref, community_id, note)
    values (
      new.member_id, v_award, 'social_share', v_ref, v_community,
      case
        when v_slug is not null and public.is_founder(new.member_id, v_slug) then 'CTA completed (Founder 1.5x)'
        when v_is_premium then 'CTA completed (premium 1.5×)'
        else 'CTA completed'
      end
    );

    update members
       set total_points = coalesce(total_points, 0) + v_award
     where id = new.member_id;

    perform public.bump_membership_points(new.member_id, v_community, v_award);

    new.points_awarded := v_award;
  end if;
  return new;
end $function$;
