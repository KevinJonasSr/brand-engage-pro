-- 0074_founder_perks.sql
--
-- APPLIED to prod (shipped in PR #86).
--
-- Founder perks (item 9). The Founder badge now carries two real perks:
--   * Founders earn 1.5x points for life. Premium also earns 1.5x, and the
--     two bonuses stack, so a founder on Premium earns 2x.
--   * Founders can RSVP to public and premium events 48 hours before
--     everyone else. Founder-only events stay founders-only as before.
--
-- Every point trigger already calls points_multiplier, so redefining it here
-- covers every way to earn points. Existing ledger rows are not touched.
--
-- Existing events open to everyone right away (rsvp_opens_at = created_at).
-- Only events created after this runs get the 48-hour founders window.
--
-- Mirrors frontend/lib/founder-perks.ts (pointsMultiplier, canRsvpNow,
-- FOUNDERS_FIRST_ERROR). Change both together.

-- ─── points_multiplier: premium + founder bonuses stack ─────────────────────
create or replace function public.points_multiplier(
  p_member_id    uuid,
  p_community_id text
)
returns numeric language sql stable security definer set search_path = public as $$
  select 1.0
    + case when public.is_premium(p_member_id, p_community_id) then 0.5 else 0 end
    + case when public.is_founder(p_member_id, p_community_id) then 0.5 else 0 end;
$$;

-- ─── brand_events.rsvp_opens_at ─────────────────────────────────────────────
-- When RSVPs open to non-founders. Null means open now.
alter table public.brand_events
  add column if not exists rsvp_opens_at timestamptz;

update public.brand_events
   set rsvp_opens_at = created_at
 where rsvp_opens_at is null;

alter table public.brand_events
  alter column rsvp_opens_at set default (now() + interval '48 hours');

comment on column public.brand_events.rsvp_opens_at is
  'When RSVPs open to non-founders. Founders can RSVP any time. Null means open now.';

-- ─── Founders-first RSVP window ─────────────────────────────────────────────
create or replace function public.enforce_founders_first()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tier      text;
  v_opens_at  timestamptz;
  v_community text;
begin
  select tier, rsvp_opens_at, community_id
    into v_tier, v_opens_at, v_community
    from brand_events
   where id = new.event_id;

  if v_opens_at is null or v_opens_at <= now() then
    return new;
  end if;
  if v_tier = 'founder-only' then
    -- Founder-only access is enforced elsewhere; no extra window here.
    return new;
  end if;
  if public.is_founder(new.member_id, v_community) then
    return new;
  end if;

  raise exception 'Founders RSVP first'
    using hint = 'RSVPs open to everyone at ' || v_opens_at::text;
end;
$$;

drop trigger if exists event_rsvps_founders_first on public.event_rsvps;
create trigger event_rsvps_founders_first
  before insert on public.event_rsvps
  for each row execute function public.enforce_founders_first();

-- ─── Smoke tests (commented; uncomment to verify) ─────────────────────────
-- select public.points_multiplier((select member_id from member_community_memberships where is_founder limit 1), 'nellies');
-- select count(*) filter (where rsvp_opens_at is null) as unset from public.brand_events;
