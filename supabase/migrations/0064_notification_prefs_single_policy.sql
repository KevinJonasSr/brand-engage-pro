-- 0064_notification_prefs_single_policy.sql
-- Already applied to production via MCP on 2026-09-28.
--
-- public.notification_preferences had three permissive self policies that
-- all said the same thing, "a member can only touch their own row":
--   notif_prefs_self               (authenticated, ALL)
--   notification_prefs_self_read   (public, SELECT)
--   notification_prefs_self_upsert (public, ALL)
-- Permissive policies are OR'ed, so the set allowed exactly what one ALL
-- policy allows. This folds them into one policy for authenticated.
-- anon never matched (auth.uid() is null for anon), so nothing is lost.
-- (select auth.uid()) lets Postgres evaluate the uid once per statement.
--
-- Runs in one transaction, so there is no moment with RLS on and no policy.
-- Idempotent: every drop uses "if exists". No data writes.

begin;

-- Fresh builds only: the table was created on prod outside the migrations
-- folder, so a fresh database has no table to put policies on. Same shape
-- as prod (2026-09-28). No-op on prod.
create table if not exists public.notification_preferences (
  member_id uuid primary key references public.members(id) on delete cascade,
  push_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  notify_new_post boolean not null default true,
  notify_event_match boolean not null default true,
  notify_comment_on_my_post boolean not null default true,
  notify_redemption boolean not null default true,
  notify_drops boolean not null default true,
  notify_rsvp_confirmation boolean not null default true,
  notify_predictions boolean not null default true,
  notify_anniversaries boolean not null default true,
  notify_leaderboard boolean not null default true,
  notify_weekly_digest boolean not null default true,
  quiet_start time,
  quiet_end time,
  timezone text not null default 'America/Chicago',
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;

drop policy if exists notif_prefs_self on public.notification_preferences;
drop policy if exists notification_prefs_self_read on public.notification_preferences;
drop policy if exists notification_prefs_self_upsert on public.notification_preferences;
drop policy if exists notification_prefs_self on public.notification_preferences;

create policy notification_prefs_self
  on public.notification_preferences
  for all
  to authenticated
  using ((select auth.uid()) = member_id)
  with check ((select auth.uid()) = member_id);

commit;
