-- 0057_rollback.sql
--
-- STORED ONLY. Do not apply this unless Kevin says so for a specific
-- incident. It is not a migration and nothing runs it automatically.
--
-- Undoes 0057_lock_down_security_definer_functions.sql by giving EXECUTE
-- on every SECURITY DEFINER function in public back to public, anon and
-- authenticated. That reopens the exposure the Supabase security advisor
-- flagged (lints 0028 and 0029): anyone with the anon key could call
-- these functions through /rest/v1/rpc.
--
-- Use it only if 0057 broke a live flow and a narrow grant for the one
-- function involved is not possible. The better fix is always a single
-- grant such as:
--   grant execute on function public.<name>(<args>) to authenticated;
--
-- Functions created after 0057 (for example 0067's move_pre_join_points)
-- were locked down on purpose in their own migrations. This rollback
-- opens them too, since it loops over every definer function.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosecdef
  loop
    execute format('grant execute on function %s to public, anon, authenticated', r.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
