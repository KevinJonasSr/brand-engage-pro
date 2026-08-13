-- ============================================================================
-- 0051_members_self_update_and_redeem_bind.sql
-- ============================================================================
-- Soft-launch points integrity (must-before marketed points economy):
--
-- 1. Column-restrict members self-update so PostgREST cannot inflate
--    total_points / current_tier / referral / stripe / moderation fields.
--    Members can still PATCH legitimate profile + preference columns.
-- 2. Bind redeem_reward (SECURITY DEFINER) to the JWT caller: authenticated
--    members may only redeem as auth.uid(). service_role / postgres keep
--    working for admin/ops (no member JWT). Revoke anon execute.
-- 3. Close the related memberships_own_update vector: UI KPIs read
--    member_community_memberships.total_points, and that policy was also
--    unrestricted. Authenticated clients cannot UPDATE that table; points
--    still move via SECURITY DEFINER + service_role (check-in, ledger, redeem).
--
-- App-written members columns (user JWT / onboard / privacy):
--   first_name, last_name, city, phone, handle, favorite_brand, interest,
--   sms_opted_in, email_opted_in, avatar_url, socials, public_profile_enabled,
--   consent_accepted_at, consent_version
-- Avatar is currently persisted via service role in /api/upload; the grant
-- still allows a future user-scoped write of avatar_url.
--
-- Not self-updatable (service_role / SECURITY DEFINER only):
--   total_points, current_tier, referral_code, referred_by, email,
--   stripe_customer_id, suspended, unsubscribe_token, profile_slug, id,
--   created_at, and any later integrity columns.
--
-- Idempotent. Fan Engage public repo had no tighter policy to mirror.
-- ============================================================================

-- ─── 1. members: column-level UPDATE for authenticated ───────────────────
-- 0025 granted table-level UPDATE to authenticated. Revoke that, then
-- re-grant only profile/prefs columns that exist on this database.

revoke update on table public.members from authenticated;

do $$
declare
  allowed text[] := array[
    'first_name',
    'last_name',
    'city',
    'phone',
    'handle',
    'favorite_brand',
    'interest',
    'sms_opted_in',
    'email_opted_in',
    'avatar_url',
    'socials',
    'public_profile_enabled',
    'consent_accepted_at',
    'consent_version'
  ];
  existing text[];
begin
  select coalesce(array_agg(a.attname order by a.attname), '{}')
    into existing
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'members'
    and a.attnum > 0
    and not a.attisdropped
    and a.attname = any (allowed);

  if existing = '{}' then
    raise exception '0051: no allowed members columns found to GRANT UPDATE';
  end if;

  execute format(
    'grant update (%s) on table public.members to authenticated',
    (select string_agg(format('%I', x), ', ') from unnest(existing) as x)
  );
end $$;

-- Defense in depth: even if table-level UPDATE is granted again later,
-- authenticated/anon sessions cannot change non-allowlisted columns.
-- SECURITY DEFINER functions and service_role run as postgres/service_role
-- (current_user), so check-in, onboard bonuses, redeem, and admin refunds
-- keep working.
create or replace function public.members_reject_integrity_column_updates()
returns trigger
language plpgsql
as $$
declare
  allowed constant text[] := array[
    'first_name',
    'last_name',
    'city',
    'phone',
    'handle',
    'favorite_brand',
    'interest',
    'sms_opted_in',
    'email_opted_in',
    'avatar_url',
    'socials',
    'public_profile_enabled',
    'consent_accepted_at',
    'consent_version',
    'updated_at'
  ];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Updating protected member fields is not allowed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists members_reject_integrity_column_updates on public.members;
create trigger members_reject_integrity_column_updates
  before update on public.members
  for each row execute function public.members_reject_integrity_column_updates();

-- Keep row-scoped self-update; columns are now grant- + trigger-restricted.
drop policy if exists members_self_update on public.members;
create policy members_self_update on public.members
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Prevent a racing self-insert of a points-inflated row before the
-- handle_new_auth_user trigger lands the default profile.
drop policy if exists members_self_insert on public.members;
create policy members_self_insert on public.members
  for insert
  with check (
    auth.uid() = id
    and coalesce(total_points, 0) = 0
    and current_tier = 'bronze'
  );

-- ─── 2. memberships: no authenticated UPDATE (KPI points live here) ──────
-- 0011 memberships_own_update allowed any column change on own rows.
-- App writes go through service_role / SECURITY DEFINER only.

revoke update on table public.member_community_memberships from authenticated;

drop policy if exists memberships_own_update on public.member_community_memberships;
create policy memberships_own_update on public.member_community_memberships
  for update
  using (false)
  with check (false);

create or replace function public.memberships_reject_direct_authenticated_updates()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Direct membership updates are not allowed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_reject_direct_authenticated_updates
  on public.member_community_memberships;
create trigger memberships_reject_direct_authenticated_updates
  before update on public.member_community_memberships
  for each row execute function public.memberships_reject_direct_authenticated_updates();

-- ─── 3. redeem_reward: bind authenticated caller to p_member_id ──────────
create or replace function public.redeem_reward(
  p_member_id uuid,
  p_reward_id uuid,
  p_delivery_details text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_member members%rowtype;
  v_reward rewards_catalog%rowtype;
  v_membership member_community_memberships%rowtype;
  v_redemption_id uuid;
  v_role text := auth.role();
begin
  -- Authenticated JWT: redeem only as the caller. service_role (and
  -- dashboard/postgres with no JWT) may pass any member id for ops.
  if v_role = 'authenticated' then
    if auth.uid() is distinct from p_member_id then
      raise exception 'Cannot redeem for another member' using errcode = '42501';
    end if;
  elsif v_role = 'anon' then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Lock the reward row to prevent overselling
  select * into v_reward from rewards_catalog where id = p_reward_id
  for update;

  if v_reward is null then
    raise exception 'Reward not found';
  end if;

  if not v_reward.active then
    raise exception 'Reward is no longer available';
  end if;

  if v_reward.stock is not null and v_reward.stock <= 0 then
    raise exception 'Reward is out of stock';
  end if;

  -- Get member and check total points
  select * into v_member from members where id = p_member_id;
  if v_member is null then
    raise exception 'Member not found';
  end if;

  if v_member.total_points < v_reward.point_cost then
    raise exception 'Insufficient points';
  end if;

  -- Check tier gating if required
  if v_reward.requires_tier is not null then
    select * into v_membership from member_community_memberships
    where member_id = p_member_id and community_id = v_reward.community_id;

    if v_membership is null then
      raise exception 'Not a member of this community';
    end if;

    if v_reward.requires_tier = 'premium' and v_membership.subscription_tier != 'premium' then
      raise exception 'Premium membership required';
    end if;

    if v_reward.requires_tier = 'founder-only' and v_membership.subscription_tier != 'founder' then
      raise exception 'Founder status required';
    end if;
  end if;

  -- Insert redemption row
  insert into reward_redemptions (member_id, reward_id, community_id, point_cost, delivery_details, status)
  values (p_member_id, p_reward_id, v_reward.community_id, v_reward.point_cost, p_delivery_details, 'pending')
  returning id into v_redemption_id;

  -- Decrement global points
  update members set total_points = total_points - v_reward.point_cost
  where id = p_member_id;

  -- Decrement community points if scoped
  if v_reward.community_id is not null then
    update member_community_memberships
    set total_points = total_points - v_reward.point_cost
    where member_id = p_member_id and community_id = v_reward.community_id;
  end if;

  -- Write points ledger
  insert into points_ledger (member_id, delta, source, source_ref, note)
  values (
    p_member_id,
    -v_reward.point_cost,
    'reward_redemption',
    'redemption:' || v_redemption_id,
    'Redeemed: ' || v_reward.title
  );

  -- Decrement stock if non-null
  if v_reward.stock is not null then
    update rewards_catalog set stock = stock - 1 where id = p_reward_id;
  end if;

  -- Notify member
  perform upsert_notification(
    p_member_id,
    'reward_redeemed',
    'Reward redeemed!',
    'You''ve redeemed ' || v_reward.title || '. An brand will fulfill it soon.',
    '/brands/' || v_reward.community_id || '/rewards',
    null,
    'redemption:' || v_redemption_id
  );

  return v_redemption_id;
end $$;

revoke all on function public.redeem_reward(uuid, uuid, text) from public;
revoke all on function public.redeem_reward(uuid, uuid, text) from anon;
grant execute on function public.redeem_reward(uuid, uuid, text) to authenticated;
grant execute on function public.redeem_reward(uuid, uuid, text) to service_role;

-- ─── Verify (run after apply; do not invent probe users) ─────────────────
-- -- Column grants: authenticated UPDATE should list only profile/prefs cols
-- select column_name, privilege_type
--   from information_schema.column_privileges
--  where table_schema = 'public' and table_name = 'members'
--    and grantee = 'authenticated' and privilege_type = 'UPDATE'
--  order by column_name;
--
-- -- Table-level UPDATE on memberships should be absent for authenticated
-- select privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public'
--    and table_name = 'member_community_memberships'
--    and grantee = 'authenticated';
--
-- -- redeem_reward execute: authenticated + service_role, not anon
-- select grantee, privilege_type
--   from information_schema.routine_privileges
--  where routine_schema = 'public' and routine_name = 'redeem_reward'
--  order by grantee, privilege_type;
--
-- -- As a signed-in member (PostgREST / SQL with JWT role=authenticated):
-- --   update members set total_points = total_points + 1 where id = auth.uid();
-- --   → 42501 / permission denied (column grant and/or trigger)
-- --   update members set first_name = first_name where id = auth.uid();
-- --   → success (0–1 row)
-- --   select redeem_reward('00000000-0000-0000-0000-000000000000'::uuid, '<reward>'::uuid);
-- --   → Cannot redeem for another member
-- -- As service_role: the same redeem_reward(other_id, reward_id) is allowed
-- --   (admin/ops). Member redeem path uses the user JWT via redeemReward().
