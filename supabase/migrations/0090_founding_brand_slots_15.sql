-- 0090_founding_brand_slots_15.sql
--
-- NOT applied by this change. Kevin runs it after merge. Do not apply it
-- to production from the app or from CI.
--
-- Public /pricing, /help, and /for-brands now say the first 15 founding
-- brands. frontend/lib/brand-billing.ts BRAND_FREE_SLOT_LIMIT is the slot
-- cap for that offer (admin billing copy uses the same constant). 0073
-- already shipped with check (free_slot between 1 and 10). This widens
-- that check to 1..15. It does not add a 12-month clock: plan = 'free'
-- is still a standing free plan.
--
-- No new table. Existing grants on public.brand_billing stay as they are.

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'brand_billing'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%free_slot%'
      and pg_get_constraintdef(con.oid) like '%10%'
  loop
    execute format('alter table public.brand_billing drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.brand_billing
  drop constraint if exists brand_billing_free_slot_check;

alter table public.brand_billing
  drop constraint if exists brand_billing_free_slot_range;

alter table public.brand_billing
  add constraint brand_billing_free_slot_range
  check (free_slot is null or (free_slot between 1 and 15));
