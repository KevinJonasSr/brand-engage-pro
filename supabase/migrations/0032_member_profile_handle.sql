-- 0032_member_profile_handle.sql
-- Public member profile pages — every member gets a unique handle and an
-- opt-out flag. Default: profile is publicly viewable, but only the
-- public-safe fields are exposed (see lib/data/member-profile.ts —
-- no email, phone, stripe ids, last login, or moderation state).
-- Members can opt out by flipping public_profile_enabled to false.
--
-- Handle format: lowercase first_name (alphanum only, "member" fallback)
-- + 4-char hex suffix from the member's auth uuid. 16^4 = 65,536
-- possible suffixes per first_name, collision-free for the
-- realistic launch scale.

-- ─── 1. Add columns ────────────────────────────────────────────────
alter table public.members
  add column if not exists handle text,
  add column if not exists public_profile_enabled boolean not null default true;

-- ─── 2. Backfill handles for existing members ──────────────────────
update public.members
set handle = lower(
  coalesce(
    nullif(regexp_replace(coalesce(first_name, ''), '[^a-zA-Z0-9]', '', 'g'), ''),
    'member'
  )
) || '-' || substring(replace(id::text, '-', ''), 1, 4)
where handle is null;

-- ─── 3. Unique index on handle (case-insensitive) ──────────────────
create unique index if not exists members_handle_unique
  on public.members (lower(handle));

-- ─── 4. Trigger to auto-generate handle on signup ──────────────────
-- Fires before INSERT so new members always have a handle. Idempotent
-- via DROP IF EXISTS + CREATE.
create or replace function public.set_default_member_handle()
returns trigger
language plpgsql
as $$
begin
  if new.handle is null then
    new.handle := lower(
      coalesce(
        nullif(regexp_replace(coalesce(new.first_name, ''), '[^a-zA-Z0-9]', '', 'g'), ''),
        'member'
      )
    ) || '-' || substring(replace(new.id::text, '-', ''), 1, 4);
  end if;
  return new;
end;
$$;

drop trigger if exists members_default_handle on public.members;
create trigger members_default_handle
  before insert on public.members
  for each row execute function public.set_default_member_handle();

-- ─── 5. Verify ─────────────────────────────────────────────────────
-- After running, you should see every existing member with a handle:
--   select count(*) filter (where handle is null) as null_handles,
--          count(*) as total
--   from public.members;
-- Expected: null_handles = 0, total = your member count.
