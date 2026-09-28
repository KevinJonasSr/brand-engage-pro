-- 0071_baseline_prod_only_tables.sql
--
-- Brand Engage: these ten tables exist on prod but were created outside the
-- migrations folder, so a fresh database (Supabase branch, local stack) did
-- not have them. Found while replaying every migration on a throwaway
-- branch for live test 02 on 2026-09-28.
--
-- Shapes, checks, indexes and policies match prod as read on 2026-09-28.
-- Everything uses "if not exists" or drop-then-create, so this is a no-op on
-- prod: no data writes, and the policies it recreates are the same ones.
--
-- (notification_preferences and fraud_signals are created in 0064 and 0070,
-- the first migrations that touch them.)

-- Shared check: a super admin (admin_users row for '*').
-- Written inline in each policy, the same way prod has it.

-- ------------------------------------------------------------ applications
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending', 'in_review', 'approved', 'rejected', 'waitlisted')),
  display_name text not null,
  slug_suggestion text,
  tagline text,
  bio text,
  hero_image text,
  social jsonb not null default '[]',
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  category text
    check (category is null or category in ('restaurant', 'retail', 'hospitality', 'entertainment', 'service', 'other')),
  location_count int,
  primary_city text,
  years_in_business int,
  monthly_transactions int,
  loyalty_program_experience text,
  has_street_team boolean,
  expected_launch_date text,
  referral_source text,
  community_pitch text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  approved_slug text,
  approved_brand_id text references public.brands(slug) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.applications enable row level security;
create index if not exists applications_status_idx
  on public.applications (status, created_at desc);

create or replace function public.touch_applications_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists applications_touch_updated_at on public.applications;
create trigger applications_touch_updated_at
  before update on public.applications
  for each row execute function public.touch_applications_updated_at();

drop policy if exists applications_anon_insert on public.applications;
create policy applications_anon_insert on public.applications
  for insert to anon, authenticated
  with check (true);

drop policy if exists applications_super_admin_read on public.applications;
create policy applications_super_admin_read on public.applications
  for select to authenticated
  using (exists (select 1 from public.admin_users
                  where user_id = auth.uid() and community_id = '*'));

drop policy if exists applications_super_admin_update on public.applications;
create policy applications_super_admin_update on public.applications
  for update to authenticated
  using (exists (select 1 from public.admin_users
                  where user_id = auth.uid() and community_id = '*'));

-- -------------------------------------------------------------- streak_log
create table if not exists public.streak_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  event_type text not null
    check (event_type in ('increment', 'reset', 'milestone', 'first_visit', 'no_op')),
  streak_days int not null,
  points_awarded int not null default 0,
  milestone_days int,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'
);
alter table public.streak_log enable row level security;
create index if not exists streak_log_member_idx
  on public.streak_log (member_id, occurred_at desc);

drop policy if exists streak_log_self_read on public.streak_log;
create policy streak_log_self_read on public.streak_log
  for select to authenticated
  using (member_id = auth.uid());

drop policy if exists streak_log_super_admin_read on public.streak_log;
create policy streak_log_super_admin_read on public.streak_log
  for select
  using (exists (select 1 from public.admin_users
                  where user_id = auth.uid() and community_id = '*'));

-- ------------------------------------------------------ push_subscriptions
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  endpoint text not null constraint push_subscriptions_endpoint_key unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.push_subscriptions enable row level security;
create index if not exists push_subscriptions_member_idx
  on public.push_subscriptions (member_id);

drop policy if exists push_sub_self on public.push_subscriptions;
create policy push_sub_self on public.push_subscriptions
  for all to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

-- -------------------------------------------------------- notification_log
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  channel text not null check (channel in ('push', 'sms')),
  notification_type text not null,
  status text not null check (status in ('sent', 'failed', 'suppressed')),
  suppression_reason text,
  payload jsonb not null default '{}',
  sent_at timestamptz not null default now()
);
alter table public.notification_log enable row level security;
create index if not exists notification_log_member_idx
  on public.notification_log (member_id, sent_at desc);
create index if not exists notification_log_type_idx
  on public.notification_log (notification_type, sent_at desc);

drop policy if exists notif_log_self_read on public.notification_log;
create policy notif_log_self_read on public.notification_log
  for select
  using (member_id = auth.uid());

-- ------------------------------------------------------ drop_notifications
create table if not exists public.drop_notifications (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('reward', 'special')),
  target_id uuid not null,
  kind text not null check (kind in ('launched', 'expiring')),
  fired_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  unique (target_type, target_id, kind)
);
alter table public.drop_notifications enable row level security;
create index if not exists drop_notifications_kind_idx
  on public.drop_notifications (kind, fired_at desc);

drop policy if exists drop_notif_super_admin_all on public.drop_notifications;
create policy drop_notif_super_admin_all on public.drop_notifications
  for all
  using (exists (select 1 from public.admin_users
                  where user_id = auth.uid() and community_id = '*'))
  with check (exists (select 1 from public.admin_users
                       where user_id = auth.uid() and community_id = '*'));

-- ---------------------------------------------------- prediction_award_log
create table if not exists public.prediction_award_log (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  points int not null,
  awarded_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  unique (post_id, member_id)
);
alter table public.prediction_award_log enable row level security;
create index if not exists prediction_award_log_post_idx
  on public.prediction_award_log (post_id, awarded_at desc);

drop policy if exists prediction_award_self_read on public.prediction_award_log;
create policy prediction_award_self_read on public.prediction_award_log
  for select
  using (member_id = auth.uid());

drop policy if exists prediction_award_super_admin_read on public.prediction_award_log;
create policy prediction_award_super_admin_read on public.prediction_award_log
  for select
  using (exists (select 1 from public.admin_users
                  where user_id = auth.uid() and community_id = '*'));

-- -------------------------------------------------- member_anniversary_log
create table if not exists public.member_anniversary_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  brand_slug text not null,
  milestone text not null
    check (milestone in ('1_month', '3_months', '6_months', '1_year', '2_years', '3_years', '5_years')),
  celebrated_at timestamptz not null default now(),
  points_awarded int not null default 0,
  metadata jsonb not null default '{}',
  unique (member_id, brand_slug, milestone)
);
alter table public.member_anniversary_log enable row level security;
create index if not exists member_anniversary_log_member_idx
  on public.member_anniversary_log (member_id, celebrated_at desc);
create index if not exists member_anniversary_log_brand_idx
  on public.member_anniversary_log (brand_slug, celebrated_at desc);

drop policy if exists member_anniversary_self_read on public.member_anniversary_log;
create policy member_anniversary_self_read on public.member_anniversary_log
  for select
  using (member_id = auth.uid());

drop policy if exists member_anniversary_super_admin_read on public.member_anniversary_log;
create policy member_anniversary_super_admin_read on public.member_anniversary_log
  for select
  using (exists (select 1 from public.admin_users
                  where user_id = auth.uid() and community_id = '*'));

-- ------------------------------------------------------- audience_segments
create table if not exists public.audience_segments (
  id uuid primary key default gen_random_uuid(),
  brand_slug text not null,
  name text not null,
  description_input text,
  filter_json jsonb not null default '{}',
  member_count int not null default 0,
  member_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now()
);
alter table public.audience_segments enable row level security;
create index if not exists audience_segments_brand_idx
  on public.audience_segments (brand_slug, created_at desc);

drop policy if exists audience_segments_admin_read on public.audience_segments;
create policy audience_segments_admin_read on public.audience_segments
  for select
  using (public.is_admin_of(brand_slug));

drop policy if exists audience_segments_admin_write on public.audience_segments;
create policy audience_segments_admin_write on public.audience_segments
  for all
  using (public.is_admin_of(brand_slug))
  with check (public.is_admin_of(brand_slug));

-- ------------------------------------------------------- brand_post_drafts
create table if not exists public.brand_post_drafts (
  id uuid primary key default gen_random_uuid(),
  brand_slug text not null,
  kind text not null default 'post' check (kind in ('post', 'announcement')),
  suggested_title text,
  suggested_body text not null,
  context_summary text,
  inputs_json jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'published', 'discarded')),
  generated_by text not null default 'ai',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_post_id uuid references public.community_posts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.brand_post_drafts enable row level security;
create index if not exists brand_post_drafts_brand_idx
  on public.brand_post_drafts (brand_slug, status, created_at desc);

drop policy if exists brand_post_drafts_admin_read on public.brand_post_drafts;
create policy brand_post_drafts_admin_read on public.brand_post_drafts
  for select
  using (public.is_admin_of(brand_slug));

drop policy if exists brand_post_drafts_admin_write on public.brand_post_drafts;
create policy brand_post_drafts_admin_write on public.brand_post_drafts
  for all
  using (public.is_admin_of(brand_slug))
  with check (public.is_admin_of(brand_slug));

-- -------------------------------------------------- network_pending_admins
-- RLS on with no policies: service role only, same as prod.
create table if not exists public.network_pending_admins (
  email text primary key,
  role text not null default 'owner',
  community_id text not null default '*',
  added_by text not null default 'kevin_request_2026_07_24',
  created_at timestamptz not null default now()
);
alter table public.network_pending_admins enable row level security;
