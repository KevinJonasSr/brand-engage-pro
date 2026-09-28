-- 0064_notification_prefs_single_policy.sql
-- Not yet applied to production. Apply only after Kevin approves.
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
