-- 0065_remove_raelynn_from_bep.sql
--
-- RaeLynn is a Fan Engage Pro community. It was never a Brand Engage Pro
-- brand, and BEP has no raelynn row in communities. The fork left 13 BEP
-- tables with community_id defaulting to 'raelynn', and award_badge and
-- redeem_reward still hardcoded it. On 2026-09-28 prod had 124 rows
-- tagged raelynn (event_rsvps 2, event_reminders 18, points_ledger 34,
-- notifications 33, member_badges 31, brand_events 6), and every new
-- member was still getting raelynn badge rows.
--
-- This migration, in order:
--   1. Adds member_home_community(member): the member's earliest-joined
--      brand, else 'jonas-group' (Kevin's default, 2026-09-28).
--   2. Adds a BEFORE INSERT trigger on the 13 tables that fills a missing
--      community_id from the row's own brand, its event, its action, its
--      offer, or the member's home brand. Several app inserts and DB
--      functions leave the column out and relied on the default, so the
--      default can only go once this is in place.
--   3. Fixes the functions that left the community out: upsert_notification
--      (new p_community_id argument), award_community_badge, award_badge,
--      award_challenge_entry_points, award_poll_vote_points,
--      award_member_action_points, notify_rsvp_confirmed,
--      notify_referral_joined and redeem_reward. The point functions now
--      also bump the brand membership total, like the other point
--      functions already do.
--   4. Moves the 124 raelynn rows (mapping approved by Kevin 2026-09-28):
--      event rows follow their event's brand, the "Visit check-in at
--      nellies" points go to nellies, the April 2026 challenge points for
--      member 75e4096e go to jonas-group, and everything else goes to the
--      member's home brand. Moved points are not re-added to membership
--      totals: they were never counted in any brand before.
--   5. Fails if any row in the 13 tables still points at a community that
--      does not exist, then drops the raelynn defaults and adds foreign
--      keys to communities(slug), matching the existing ones.

-- 1. Home brand ------------------------------------------------------------

create or replace function public.member_home_community(p_member_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select community_id
       from member_community_memberships
      where member_id = p_member_id
      order by joined_at asc nulls last, community_id
      limit 1),
    'jonas-group'
  );
$function$;

revoke execute on function public.member_home_community(uuid) from public, anon, authenticated;
grant execute on function public.member_home_community(uuid) to service_role;

-- 2. Fill-in trigger -------------------------------------------------------

create or replace function public.fill_community_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.community_id is not null then return new; end if;

  case tg_table_name
    when 'brand_events', 'campaigns', 'community_posts', 'specials' then
      new.community_id := new.brand_slug;
    when 'member_actions' then
      -- A global action (no brand) belongs to the house brand.
      new.community_id := coalesce(new.brand_slug, 'jonas-group');
    when 'event_rsvps', 'event_reminders' then
      select community_id into new.community_id
        from brand_events where id = new.event_id;
    when 'member_action_completions' then
      select community_id into new.community_id
        from member_actions where id = new.action_id;
    when 'purchases' then
      select community_id into new.community_id
        from offers where id = new.offer_id;
    when 'referrals' then
      new.community_id := member_home_community(new.referrer_id);
    when 'member_badges', 'notifications', 'points_ledger' then
      new.community_id := member_home_community(new.member_id);
    else
      raise exception 'fill_community_id: no rule for table %', tg_table_name;
  end case;

  if new.community_id is null then
    raise exception 'community_id is required on %', tg_table_name
      using errcode = '23502';
  end if;
  return new;
end $function$;

-- "aa_" so it runs before the other BEFORE INSERT triggers
-- (enforce_event_capacity, set_updated_at), which fire in name order.
do $$
declare t text;
begin
  foreach t in array array[
    'brand_events', 'campaigns', 'community_posts', 'event_reminders',
    'event_rsvps', 'member_action_completions', 'member_actions',
    'member_badges', 'notifications', 'points_ledger', 'purchases',
    'referrals', 'specials'
  ] loop
    execute format('drop trigger if exists aa_fill_community_id on public.%I', t);
    execute format(
      'create trigger aa_fill_community_id before insert on public.%I '
      'for each row execute function public.fill_community_id()', t);
  end loop;
end $$;

-- 3. Functions -------------------------------------------------------------

-- upsert_notification gains p_community_id. The old 7-argument version is
-- dropped so 7-argument calls resolve to the new one without ambiguity.
drop function if exists public.upsert_notification(uuid, text, text, text, text, text, text);

create or replace function public.upsert_notification(
  p_member_id uuid,
  p_kind text,
  p_title text,
  p_body text default null::text,
  p_url text default null::text,
  p_icon text default null::text,
  p_dedup_key text default null::text,
  p_community_id text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_dedup_key is not null then
    if exists (
      select 1 from notifications
      where member_id = p_member_id and dedup_key = p_dedup_key
    ) then return; end if;
  end if;
  -- A null p_community_id is filled by the fill_community_id trigger.
  insert into notifications (member_id, kind, title, body, url, icon, dedup_key, community_id)
  values (p_member_id, p_kind, p_title, p_body, p_url, p_icon, p_dedup_key, p_community_id);
exception when unique_violation then
  -- Race condition: another txn won the dedup. Silently swallow.
  return;
end $function$;

revoke execute on function public.upsert_notification(uuid, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.upsert_notification(uuid, text, text, text, text, text, text, text)
  to service_role;

create or replace function public.award_community_badge(p_member_id uuid, p_slug text, p_community_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_points   integer;
  v_name     text;
  v_icon     text;
  v_ref      text;
  v_inserted boolean;
begin
  insert into member_badges (member_id, badge_slug, community_id)
  values (p_member_id, p_slug, p_community_id)
  on conflict (member_id, badge_slug, community_id) do nothing
  returning true into v_inserted;

  -- Already earned in this community — no-op, no cascade.
  if v_inserted is null then return false; end if;

  select point_value, name, icon into v_points, v_name, v_icon
    from badges where slug = p_slug;

  -- Points credit — scoped per (member, badge, community) so the same badge
  -- earned in two communities awards points twice (correct: two separate
  -- achievements).
  if coalesce(v_points, 0) > 0 then
    v_ref := 'badge:' || p_slug || ':' || p_community_id || ':' || p_member_id::text;
    if not exists (select 1 from points_ledger where source_ref = v_ref) then
      insert into points_ledger (member_id, delta, source, source_ref, community_id, note)
      values (
        p_member_id, v_points, 'manual_adjustment', v_ref, p_community_id,
        'Badge earned: ' || p_slug || ' (' || p_community_id || ')'
      );

      update members
         set total_points = coalesce(total_points, 0) + v_points
       where id = p_member_id;

      perform bump_membership_points(p_member_id, p_community_id, v_points);
    end if;
  end if;

  -- In-app notification. dedup_key scoped to (badge_slug, community_id) so
  -- earning the same badge in two communities gives two separate pings.
  perform upsert_notification(
    p_member_id,
    'badge_earned',
    coalesce(v_name, 'Badge earned'),
    case when coalesce(v_points, 0) > 0
         then 'You earned ' || v_points || ' bonus points.'
         else 'You unlocked a new badge.' end,
    '/rewards',
    v_icon,
    'badge:' || p_slug || ':' || p_community_id,
    p_community_id
  );

  return true;
end $function$;

create or replace function public.award_badge(p_member_id uuid, p_slug text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform award_community_badge(p_member_id, p_slug, member_home_community(p_member_id));
end $function$;

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
      case when v_multiplier > 1 then 'Challenge submission (premium 1.5×)' else 'Challenge submission' end
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
      case when v_multiplier > 1 then 'Poll vote (premium 1.5×)' else 'Poll vote' end
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
  -- Pull the action's base points and home community in one go.
  select point_value, brand_slug into v_base, v_slug
    from member_actions where id = new.action_id;
  if v_base is null or v_base <= 0 then return new; end if;

  -- Scoped action → per-community multiplier. Global action (slug NULL)
  -- → flat base, no multiplier, credited to the member's home brand.
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
      case when v_is_premium then 'CTA completed (premium 1.5×)' else 'CTA completed' end
    );

    update members
       set total_points = coalesce(total_points, 0) + v_award
     where id = new.member_id;

    perform public.bump_membership_points(new.member_id, v_community, v_award);

    new.points_awarded := v_award;
  end if;
  return new;
end $function$;

create or replace function public.notify_rsvp_confirmed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_title       text;
  v_brand_name text;
  v_brand_slug text;
  v_starts_at   timestamptz;
  v_event_date  text;
  v_body        text;
begin
  select ae.title, ae.brand_slug, ae.starts_at, ae.event_date, a.name
    into v_title, v_brand_slug, v_starts_at, v_event_date, v_brand_name
    from brand_events ae
    left join brands a on a.slug = ae.brand_slug
    where ae.id = new.event_id;

  v_body := coalesce(v_title, 'Event');
  if v_brand_name is not null then
    v_body := v_body || ' · ' || v_brand_name;
  end if;
  if v_starts_at is not null then
    v_body := v_body || ' · ' || to_char(v_starts_at at time zone 'UTC', 'Mon DD');
  elsif v_event_date is not null then
    v_body := v_body || ' · ' || v_event_date;
  end if;

  perform upsert_notification(
    new.member_id,
    'rsvp_confirmed',
    'You''re on the list',
    v_body,
    '/brands/' || coalesce(v_brand_slug, ''),
    '🎟️',
    'rsvp:' || new.event_id::text,
    new.community_id
  );
  return new;
end $function$;

create or replace function public.notify_referral_joined()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_referred_name text;
  v_body          text;
begin
  if new.status <> 'verified' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'verified' then return new; end if;

  select first_name into v_referred_name from members where id = new.referred_id;
  v_body := coalesce(v_referred_name, 'A new member') || ' just joined via your invite. +' ||
            coalesce(new.points_awarded, 150) || ' pts.';

  perform upsert_notification(
    new.referrer_id,
    'referral_joined',
    'Referral confirmed',
    v_body,
    '/referrals',
    '🤝',
    'referral:' || new.referred_id::text,
    new.community_id
  );
  return new;
end $function$;

-- redeem_reward: prod body from 0062 with the raelynn fallback removed,
-- the notification tagged with the reward's brand, and the copy typo fixed.
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

  if v_reward.community_id is null then
    raise exception 'Reward has no brand';
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

  update member_community_memberships
  set total_points = total_points - v_reward.point_cost
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
end $function$;

-- Same grants as 0057 and 0062: members call it with their session.
revoke execute on function public.redeem_reward(uuid, uuid, text) from public, anon;
grant execute on function public.redeem_reward(uuid, uuid, text) to authenticated, service_role;

-- 4. Move the raelynn rows -------------------------------------------------

-- Events take their own brand.
update public.brand_events
   set community_id = brand_slug
 where community_id = 'raelynn';

-- RSVPs and reminders follow their event.
update public.event_rsvps r
   set community_id = e.community_id
  from public.brand_events e
 where e.id = r.event_id and r.community_id = 'raelynn';

update public.event_reminders r
   set community_id = e.community_id
  from public.brand_events e
 where e.id = r.event_id and r.community_id = 'raelynn';

-- "RSVP confirmed" notifications follow the event in their dedup key.
update public.notifications n
   set community_id = e.community_id
  from public.brand_events e
 where n.community_id = 'raelynn'
   and n.kind = 'rsvp_confirmed'
   and n.dedup_key ~ '^rsvp:[0-9a-f-]{36}$'
   and e.id = split_part(n.dedup_key, ':', 2)::uuid;

-- Every other notification goes to the member's home brand.
update public.notifications
   set community_id = public.member_home_community(member_id)
 where community_id = 'raelynn';

-- Points: nellies check-ins to nellies, member 75e4096e's April 2026
-- challenge points to jonas-group, the rest to the member's home brand.
update public.points_ledger
   set community_id = case
         when note ilike 'Visit check-in at nellies%' then 'nellies'
         when member_id::text like '75e4096e-%' and source = 'challenge' then 'jonas-group'
         else public.member_home_community(member_id)
       end
 where community_id = 'raelynn';

-- Badges go to the member's home brand. Drop a raelynn copy if the member
-- already holds the same badge there (none on 2026-09-28, kept for safety).
delete from public.member_badges b
 where b.community_id = 'raelynn'
   and exists (
     select 1 from public.member_badges t
      where t.member_id = b.member_id
        and t.badge_slug = b.badge_slug
        and t.community_id = public.member_home_community(b.member_id)
   );

update public.member_badges
   set community_id = public.member_home_community(member_id)
 where community_id = 'raelynn';

-- 5. Guard, drop defaults, add foreign keys --------------------------------

do $$
declare
  t text;
  n bigint;
  bad text := '';
begin
  foreach t in array array[
    'brand_events', 'campaigns', 'community_posts', 'event_reminders',
    'event_rsvps', 'member_action_completions', 'member_actions',
    'member_badges', 'notifications', 'points_ledger', 'purchases',
    'referrals', 'specials'
  ] loop
    execute format(
      'select count(*) from public.%I x '
      'where not exists (select 1 from public.communities c where c.slug = x.community_id)', t)
      into n;
    if n > 0 then bad := bad || format(' %s=%s', t, n); end if;
  end loop;
  if bad <> '' then
    raise exception 'Rows with an unknown community_id remain:%', bad;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'brand_events', 'campaigns', 'community_posts', 'event_reminders',
    'event_rsvps', 'member_action_completions', 'member_actions',
    'member_badges', 'notifications', 'points_ledger', 'purchases',
    'referrals', 'specials'
  ] loop
    execute format('alter table public.%I alter column community_id drop default', t);
    execute format(
      'alter table public.%I add constraint %I foreign key (community_id) '
      'references public.communities(slug) on delete cascade',
      t, t || '_community_id_fkey');
  end loop;
end $$;

notify pgrst, 'reload schema';
