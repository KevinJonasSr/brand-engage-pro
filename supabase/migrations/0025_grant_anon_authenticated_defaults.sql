-- ============================================================================
-- 0025_grant_anon_authenticated_defaults.sql
-- ============================================================================
-- Restores the Supabase default schema/role grants that were wiped when we
-- bootstrapped BEP via `drop schema public cascade; create schema public;`
-- in the consolidated migration. Without these, PostgREST returns 401
-- with code 42501 "permission denied for table X" for ALL anon reads and
-- authenticated writes, regardless of the RLS policies in place.
--
-- The fix in plain English:
--   * Let `anon` and `authenticated` see the public schema.
--   * Let `anon` SELECT from any current and future public table — RLS
--     policies (already in place from migrations 0001..0024) gate rows.
--   * Let `authenticated` do full CRUD — RLS gates rows and ops.
--   * Let `service_role` do anything — it already does, this just makes the
--     ALTER DEFAULT PRIVILEGES symmetric.
--   * Sequences + functions same treatment.
--
-- Idempotent: GRANT is repeatable, ALTER DEFAULT PRIVILEGES updates the
-- single matching row.
-- ============================================================================

-- ─── Schema usage ────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated, service_role;

-- ─── Table privileges (existing tables) ──────────────────────────────────
grant select                             on all tables in schema public to anon;
grant select, insert, update, delete     on all tables in schema public to authenticated;
grant all                                on all tables in schema public to service_role;

-- ─── Sequence privileges ─────────────────────────────────────────────────
grant usage, select on all sequences in schema public to anon, authenticated;
grant all           on all sequences in schema public to service_role;

-- ─── Function privileges ─────────────────────────────────────────────────
grant execute on all functions in schema public to anon, authenticated;
grant all     on all functions in schema public to service_role;

-- ─── Default privileges for tables/sequences/functions created LATER ────
-- This is the bit that was silently dropped when public schema was recreated.
-- Without it, new tables (like 0024's `specials`, future migrations, etc.)
-- would also have no grants by default — even though we did remember to
-- grant on `specials` directly.
alter default privileges in schema public
  grant select on tables to anon;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;

alter default privileges in schema public
  grant all on sequences to service_role;

alter default privileges in schema public
  grant execute on functions to anon, authenticated;

alter default privileges in schema public
  grant all on functions to service_role;

-- ─── Verify (commented; uncomment to spot-check) ─────────────────────────
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'brands'
-- order by grantee, privilege_type;
--
-- expected output includes:
--   anon          | SELECT
--   authenticated | SELECT, INSERT, UPDATE, DELETE
--   service_role  | (all 7)
