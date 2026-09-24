-- Brand Engage: lock down SECURITY DEFINER functions.
-- Already applied to production via MCP on 2026-09-24; kept here for the repo record.
--
-- Before this migration, the SECURITY DEFINER functions in public (40 of
-- them) could be called by anyone holding the public anon key (Supabase
-- advisor 0028/0029), including ones that write data or read across members.
--
-- Approach: revoke EXECUTE on every SECURITY DEFINER function in public from
-- PUBLIC, anon and authenticated, keep service_role, then grant back only
-- what a browser session actually needs.
--
-- Trigger functions are included. Postgres does not check EXECUTE when a
-- trigger fires, so the triggers keep working.
--
-- Kept, and why (checked against origin/main 954e153 on 2026-09-24):
--   anon + authenticated
--     is_admin_of    used by RLS policies that apply to PUBLIC
--   authenticated only
--     redeem_reward  called with the session client; the function rejects
--                    p_member_id <> auth.uid()
--     is_member_of   only answers for auth.uid()
--
-- Everything else the app calls goes through createAdminClient(), which uses
-- service_role.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.fn);
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end $$;

grant execute on function public.is_admin_of(text) to anon, authenticated;
grant execute on function public.redeem_reward(uuid, uuid, text) to authenticated;
grant execute on function public.is_member_of(text) to authenticated;
