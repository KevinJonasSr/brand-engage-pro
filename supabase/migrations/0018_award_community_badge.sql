-- ────────────────────────────────────────────────────────────────────────────
-- Brand Engage Pro — Phase 5e: multi-tenant badge award function
--
-- The existing award_badge() from migration 0010 pre-dates multi-tenant
-- (migration 0011) and doesn't know about community_id. The Stripe webhook
-- for the Founding Member path currently inserts member_badges directly (raw
-- insert), which:
--
--   1. skips the +500 pts ledger entry that award_badge() does,
--   2. skips the in-app notification member-out, and
--   3. has no graceful handling for duplicate-key errors if the webhook
--      re-fires (Stripe retries on 5xx, so this matters).
--
-- This migration adds award_community_badge(), a multi-tenant variant that
-- does all three correctly and is idempotent on (member_id, badge_slug,
-- community_id). Returns true if the badge was newly awarded, false if it
-- already existed.
--
-- Safe to re-run.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.award_community_badge(
  p_member_id       uuid,
  p_slug         text,
  p_community_id text
) returns boolean language plpgsql security definer set search_path = public as $$
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
      insert into points_ledger (member_id, delta, source, source_ref, note)
      values (
        p_member_id, v_points, 'manual_adjustment', v_ref,
        'Badge earned: ' || p_slug || ' (' || p_community_id || ')'
      );

      update members
         set total_points = coalesce(total_points, 0) + v_points
       where id = p_member_id;
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
    'badge:' || p_slug || ':' || p_community_id
  );

  return true;
end $$;

-- ─── Smoke test (commented; uncomment to verify) ──────────────────────────
-- Call it for a member that doesn't have the badge yet → returns true,
-- and you should see a points_ledger entry + notifications row appear.
-- select public.award_community_badge(
--   (select id from members limit 1),
--   'founding-member',
--   'raelynn'
-- );
