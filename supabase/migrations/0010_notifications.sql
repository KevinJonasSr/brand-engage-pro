-- ────────────────────────────────────────────────────────────────────────────
-- Brand Engage Pro — Phase 3f: in-app notifications inbox
-- Safe to re-run (idempotent).
-- Apply via: Supabase dashboard → SQL Editor → paste → Run.
-- ────────────────────────────────────────────────────────────────────────────

-- ─── Notifications table ──────────────────────────────────────────────────
-- One row per delivered in-app notification. Members read their own rows; mark
-- them read via an update that sets `read_at`. Server-side inserts only (via
-- service-role admin client or SECURITY DEFINER triggers).
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members(id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  url        text,
  icon       text,
  dedup_key  text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

-- Unread-first feed index
create index if not exists notifications_member_created_idx
  on public.notifications (member_id, created_at desc);

-- Dedup guard: the same member can't get two notifications with the same key.
-- Partial index so multiple rows without a dedup_key don't conflict.
create unique index if not exists notifications_member_dedup_idx
  on public.notifications (member_id, dedup_key)
  where dedup_key is not null;

-- ─── RLS ──────────────────────────────────────────────────────────────────
alter table public.notifications enable row level security;

drop policy if exists notifications_own_read on public.notifications;
create policy notifications_own_read on public.notifications
  for select using (auth.uid() = member_id);

-- Members can mark their own notifications read (update read_at). They cannot
-- change member_id / kind / content.
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications
  for update using (auth.uid() = member_id) with check (auth.uid() = member_id);

-- Inserts via service role only (triggers below run as SECURITY DEFINER, and
-- server-side inserts go through the admin client).

-- ─── Helper: upsert_notification (idempotent via dedup_key) ───────────────
create or replace function public.upsert_notification(
  p_member_id    uuid,
  p_kind      text,
  p_title     text,
  p_body      text default null,
  p_url       text default null,
  p_icon      text default null,
  p_dedup_key text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_dedup_key is not null then
    if exists (
      select 1 from notifications
      where member_id = p_member_id and dedup_key = p_dedup_key
    ) then return; end if;
  end if;
  insert into notifications (member_id, kind, title, body, url, icon, dedup_key)
  values (p_member_id, p_kind, p_title, p_body, p_url, p_icon, p_dedup_key);
exception when unique_violation then
  -- Race condition: another txn won the dedup. Silently swallow.
  return;
end $$;

-- ─── Extend award_badge to also fire an in-app notification ───────────────
-- Same signature as 0004; just adds the notification call. Idempotent since
-- upsert_notification skips on dedup_key match.
create or replace function public.award_badge(p_member_id uuid, p_slug text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_points   integer;
  v_name     text;
  v_icon     text;
  v_ref      text;
  v_inserted boolean;
begin
  insert into member_badges (member_id, badge_slug)
  values (p_member_id, p_slug)
  on conflict (member_id, badge_slug) do nothing
  returning true into v_inserted;

  if v_inserted is null then return; end if;  -- already earned

  select point_value, name, icon into v_points, v_name, v_icon
    from badges where slug = p_slug;

  if coalesce(v_points, 0) > 0 then
    v_ref := 'badge:' || p_slug || ':' || p_member_id::text;
    if not exists (select 1 from points_ledger where source_ref = v_ref) then
      insert into points_ledger (member_id, delta, source, source_ref, note)
      values (p_member_id, v_points, 'manual_adjustment', v_ref, 'Badge earned: ' || p_slug);

      update members
        set total_points = coalesce(total_points, 0) + v_points
      where id = p_member_id;
    end if;
  end if;

  -- Member-out in-app notification
  perform upsert_notification(
    p_member_id,
    'badge_earned',
    coalesce(v_name, 'Badge earned'),
    case when coalesce(v_points, 0) > 0
         then 'You earned ' || v_points || ' bonus points.'
         else 'You unlocked a new badge.' end,
    '/rewards',
    v_icon,
    'badge:' || p_slug
  );
end $$;

-- ─── RSVP confirmation notifications ──────────────────────────────────────
create or replace function public.notify_rsvp_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
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
    'rsvp:' || new.event_id::text
  );
  return new;
end $$;

drop trigger if exists event_rsvps_notify on public.event_rsvps;
create trigger event_rsvps_notify
  after insert on public.event_rsvps
  for each row execute function public.notify_rsvp_confirmed();

-- ─── Referral-joined notifications ────────────────────────────────────────
create or replace function public.notify_referral_joined()
returns trigger language plpgsql security definer set search_path = public as $$
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
    'referral:' || new.referred_id::text
  );
  return new;
end $$;

drop trigger if exists referrals_notify_ins on public.referrals;
create trigger referrals_notify_ins
  after insert on public.referrals
  for each row execute function public.notify_referral_joined();

drop trigger if exists referrals_notify_upd on public.referrals;
create trigger referrals_notify_upd
  after update of status on public.referrals
  for each row execute function public.notify_referral_joined();

-- Note on challenge winners: community_challenge_entries has no status column
-- in the current schema — admins pick winners via /admin/challenges, which
-- writes a `challenge_winner` row to campaign_items. The winner notification
-- is inserted by that server action directly (see app/admin/challenges/actions.ts).

-- ─── Smoke-test queries ────────────────────────────────────────────────────
-- select count(*) as total, count(*) filter (where read_at is null) as unread
--   from notifications;
-- select member_id, kind, title, body, dedup_key, created_at
--   from notifications order by created_at desc limit 20;
