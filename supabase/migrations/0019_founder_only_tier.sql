-- ────────────────────────────────────────────────────────────────────────────
-- Brand Engage Pro — Phase 5e: founder-only access tier
--
-- Extends the existing binary visibility/tier system (public, premium) to
-- include a third tier: 'founder-only'. Only members with is_founder=true in
-- member_community_memberships can access founder-only content.
--
-- Adds a helper function is_founder(member_id, community_id) to match the
-- pattern of is_premium(). Idempotent: all statements rerunnable.
-- ────────────────────────────────────────────────────────────────────────────

-- ─── Widen community_posts.visibility constraint ────────────────────────────
-- Drop the old constraint if it exists and replace with a wider one.
do $$
begin
  -- Drop the old constraint
  alter table public.community_posts
    drop constraint if exists community_posts_visibility_check;

  -- Add the new, wider constraint
  alter table public.community_posts
    add constraint community_posts_visibility_check
    check (visibility in ('public', 'premium', 'founder-only'));
exception when others then
  -- If the column doesn't exist yet, that's fine (e.g., first-ever run)
  null;
end $$;

-- ─── Widen brand_events.tier constraint ──────────────────────────────────
-- Same pattern as community_posts.
do $$
begin
  alter table public.brand_events
    drop constraint if exists brand_events_tier_check;

  alter table public.brand_events
    add constraint brand_events_tier_check
    check (tier in ('public', 'premium', 'founder-only'));
exception when others then
  null;
end $$;

-- ─── is_founder(member_id, community_id) ──────────────────────────────────────
-- Returns true iff the member has is_founder=true in member_community_memberships
-- for the specified community. Matches the pattern of is_premium().
create or replace function public.is_founder(
  p_member_id uuid,
  p_community_id text
) returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1
    from member_community_memberships
    where member_id = p_member_id
      and community_id = p_community_id
      and is_founder = true
  );
$$;

-- ─── Smoke tests (commented; uncomment to verify) ─────────────────────────
-- select public.is_founder((select id from members limit 1), 'raelynn');
-- select visibility, count(*) from public.community_posts group by 1 order by 1;
-- select tier, count(*) from public.brand_events group by 1 order by 1;
