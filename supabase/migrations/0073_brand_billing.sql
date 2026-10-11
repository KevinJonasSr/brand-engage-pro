-- 0073_brand_billing.sql
--
-- APPLIED to prod (shipped in PR #85).
--
-- Brand billing (item 8). Brands pay, guests are always free.
--   * The first 10 businesses are free (plan = 'free', free_slot 1..10).
--   * Everyone after that is $50 per brand per month through Stripe, with a
--     card taken up front and a 30-day trial.
--   * If a paid brand stops paying, its admin tools go read-only after a
--     14-day grace period. The guest side keeps working the whole time.
--
-- A brand with no row here is treated as unlocked. That keeps every brand
-- that exists today working until it is either granted a free slot or
-- starts a paid plan.
--
-- The lock rule below mirrors frontend/lib/brand-billing.ts
-- (isBrandBillingLocked). Change both together.

create table if not exists public.brand_billing (
  community_id           text primary key
                           references public.communities(slug) on delete cascade,
  plan                   text not null default 'standard'
                           check (plan in ('free', 'standard')),
  free_slot              smallint unique check (free_slot between 1 and 10),
  status                 text not null default 'pending'
                           check (status in ('pending', 'trialing', 'active',
                                             'past_due', 'unpaid', 'canceled',
                                             'incomplete')),
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  trial_ends_at          timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  past_due_since         timestamptz,
  trial_used             boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint brand_billing_free_slot_matches_plan
    check ((plan = 'free') = (free_slot is not null))
);

comment on table public.brand_billing is
  'Per-brand billing state. Written only by the server (service role) and the Stripe webhook.';

alter table public.brand_billing enable row level security;

drop policy if exists brand_billing_admin_read on public.brand_billing;
create policy brand_billing_admin_read on public.brand_billing
  for select using (public.is_admin_of(community_id));
-- No insert/update/delete policies: only service_role writes.

create or replace function public.brand_billing_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists brand_billing_touch_updated_at on public.brand_billing;
create trigger brand_billing_touch_updated_at
  before update on public.brand_billing
  for each row execute function public.brand_billing_touch_updated_at();

-- Lock rule for one brand. Grace period is 14 days from past_due_since.
create or replace function public.brand_billing_locked(p_community_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when b.plan = 'free' then false
      when b.status in ('unpaid', 'canceled') then true
      when b.status = 'past_due' then
        b.past_due_since is not null
        and b.past_due_since <= now() - interval '14 days'
      else false
    end
    from brand_billing b
    where b.community_id = p_community_id
  ), false);
$$;

-- Is the signed-in admin's current brand locked? Resolves the current brand
-- the same way getAdminContext() does in frontend/lib/admin.ts:
--   * super admin ('*' grant): never locked
--   * one brand: that brand
--   * several brands: the cookie value if they hold a grant for it, else the
--     first grant
-- Used by frontend/proxy.ts to refuse admin server-action POSTs.
create or replace function public.admin_write_locked(p_cookie_brand text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_brand text;
begin
  if v_uid is null then
    return false;
  end if;

  if exists (
    select 1 from admin_users where user_id = v_uid and community_id = '*'
  ) then
    return false;
  end if;

  select community_id into v_brand
    from admin_users
   where user_id = v_uid
     and community_id = p_cookie_brand
   limit 1;

  if v_brand is null then
    select community_id into v_brand
      from admin_users
     where user_id = v_uid
     order by created_at nulls last, community_id
     limit 1;
  end if;

  if v_brand is null then
    return false;
  end if;

  return brand_billing_locked(v_brand);
end;
$$;

revoke execute on function public.brand_billing_locked(text) from public, anon, authenticated;
grant execute on function public.brand_billing_locked(text) to service_role;
revoke execute on function public.admin_write_locked(text) from public, anon;
grant execute on function public.admin_write_locked(text) to authenticated, service_role;
