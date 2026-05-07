-- 0033_socials_and_profile_slug.sql
-- Architectural correction: previously `members.handle` was overloaded as
-- both (a) the TikTok/Instagram handle written by the onboarding
-- wizard's "TikTok or Instagram handle" field, AND (b) the URL slug
-- added by migration 0032 for /members/<handle>. Two concerns, one
-- column — collision.
--
-- This migration splits them:
--   - members.socials  (jsonb)  — social-handle storage. Matches the
--     brand pattern (brands.social is jsonb).
--   - members.profile_slug (text) — URL-safe profile slug used by
--     /members/<slug> and the unique index.
--
-- The legacy `handle` column stays for one release as a deprecated
-- field. Values that look like social handles are moved to
-- socials.instagram_or_tiktok and the source nulled, so reads are
-- unambiguous. Drop `handle` once the frontend stops referencing it.

-- ─── 1. Add socials JSONB ──────────────────────────────────────────
alter table public.members
  add column if not exists socials jsonb not null default '{}'::jsonb;

-- ─── 2. Move existing handle → socials.instagram_or_tiktok ─────────
-- Anything that starts with `@` OR contains chars outside the URL-slug
-- alphabet is, by definition, a social handle, not a slug.
update public.members
set
  socials = coalesce(socials, '{}'::jsonb)
            || jsonb_build_object('instagram_or_tiktok', handle),
  handle  = null
where handle is not null
  and (handle ~ '[^a-z0-9-]' or handle ~ '^@');

-- ─── 3. Add profile_slug column ────────────────────────────────────
alter table public.members
  add column if not exists profile_slug text;

-- ─── 4. Backfill profile_slug for everyone ─────────────────────────
update public.members
set profile_slug = lower(
  coalesce(
    nullif(regexp_replace(coalesce(first_name, ''), '[^a-zA-Z0-9]', '', 'g'), ''),
    'member'
  )
) || '-' || substring(replace(id::text, '-', ''), 1, 4)
where profile_slug is null;

-- ─── 5. Unique index on profile_slug (case-insensitive) ────────────
create unique index if not exists members_profile_slug_unique
  on public.members (lower(profile_slug));

-- ─── 6. Drop old handle unique index ───────────────────────────────
drop index if exists members_handle_unique;

-- ─── 7. Replace handle trigger with profile_slug trigger ───────────
drop trigger if exists members_default_handle on public.members;
drop function if exists public.set_default_member_handle();

create or replace function public.set_default_member_profile_slug()
returns trigger
language plpgsql
as $func$
begin
  if new.profile_slug is null then
    new.profile_slug := lower(
      coalesce(
        nullif(regexp_replace(coalesce(new.first_name, ''), '[^a-zA-Z0-9]', '', 'g'), ''),
        'member'
      )
    ) || '-' || substring(replace(new.id::text, '-', ''), 1, 4);
  end if;
  return new;
end;
$func$;

drop trigger if exists members_default_profile_slug on public.members;
create trigger members_default_profile_slug
  before insert on public.members
  for each row execute function public.set_default_member_profile_slug();

-- ─── 8. Verify ─────────────────────────────────────────────────────
-- select
--   count(*) filter (where profile_slug is null) as null_slugs,
--   count(*) as total,
--   count(*) filter (where socials != '{}'::jsonb) as with_socials
-- from public.members;
-- Expected: null_slugs = 0, total = your member count.
