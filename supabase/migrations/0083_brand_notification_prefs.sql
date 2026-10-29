-- 0083_brand_notification_prefs.sql
-- Sprint 2, track D: per-brand mute for brand-triggered notifications.
--
-- public.notification_preferences (0064) holds one row per member with global
-- per-type toggles. This adds a second, sparse table keyed by
-- (member_id, brand_slug) so a member can mute one brand they follow without
-- turning off posts/drops/predictions everywhere. A missing row means "not
-- muted" — rows are only written when the member flips the switch.
--
-- The fan-out triggers (lib/notifications/triggers/{new-post,drop,prediction})
-- read this table with the service role and drop muted members before
-- sending. Member-scoped notifications (RSVP reminders, redemptions,
-- comments on own posts) ignore it on purpose.
--
-- RLS follows 0064: one ALL policy for authenticated, scoped to the caller's
-- own rows with (select auth.uid()) so the uid is evaluated once per
-- statement. service_role bypasses RLS by default and already holds
-- "grant all on all tables" from 0025; an explicit grant is repeated here so
-- a fresh build does not depend on default privileges.
--
-- Idempotent: create if not exists, drop policy if exists. No enum changes.

begin;

create table if not exists public.member_brand_notification_prefs (
  member_id  uuid not null references public.members(id) on delete cascade,
  brand_slug text not null references public.brands(slug) on delete cascade,
  muted      boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (member_id, brand_slug)
);

-- Trigger fan-out looks up "who muted this brand" per run.
create index if not exists member_brand_notification_prefs_brand_muted_idx
  on public.member_brand_notification_prefs (brand_slug)
  where muted;

alter table public.member_brand_notification_prefs enable row level security;

drop policy if exists member_brand_notification_prefs_self
  on public.member_brand_notification_prefs;

create policy member_brand_notification_prefs_self
  on public.member_brand_notification_prefs
  for all
  to authenticated
  using ((select auth.uid()) = member_id)
  with check ((select auth.uid()) = member_id);

grant select, insert, update, delete
  on public.member_brand_notification_prefs to authenticated;
grant all on public.member_brand_notification_prefs to service_role;

commit;
