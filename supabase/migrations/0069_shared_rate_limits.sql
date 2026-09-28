-- 0069_shared_rate_limits.sql
--
-- Brand Engage: move rate limiting out of per-instance memory into one
-- shared table, so every Vercel instance counts against the same limit.
-- Before this, each serverless instance kept its own Map, so a caller who
-- landed on several instances got several times the limit.
--
-- Shape:
--   * public.rate_limits holds one row per (limiter, caller) bucket. The
--     key is built in lib/rate-limiter.ts as "<limiter>:<sha256 of the
--     caller id>", so raw IPs and user ids are never stored.
--   * public.rate_limit_hit(key, window_ms) counts one request and returns
--     the bucket's count and reset time in a single atomic upsert. When the
--     window has passed, the bucket starts over at 1.
--   * The app decides allow or deny by comparing the count to its limit.
--
-- Access: only service_role (the server-side admin client) may touch the
-- table or call the function. RLS is on with no policies, and anon and
-- authenticated have no grants, so the API cannot read or reset buckets.
-- The function is SECURITY INVOKER, so it runs with the caller's rights.
--
-- Cleanup: each call has a 1 in 100 chance of deleting buckets whose
-- window ended more than a day ago, so the table stays small without cron.

create table if not exists public.rate_limits (
  key text primary key,
  count integer not null check (count >= 1),
  reset_at timestamptz not null
);

comment on table public.rate_limits is
  'Shared rate limit buckets. Key is "<limiter>:<sha256 of caller id>". Service role only.';

alter table public.rate_limits enable row level security;

revoke all on table public.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.rate_limits to service_role;

create or replace function public.rate_limit_hit(p_key text, p_window_ms integer)
returns table (hit_count integer, reset_at timestamptz)
language plpgsql
security invoker
set search_path to 'public'
as $$
#variable_conflict use_column
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then
    raise exception 'rate_limit_hit: invalid key' using errcode = '22023';
  end if;
  if p_window_ms is null or p_window_ms < 1 or p_window_ms > 86400000 then
    raise exception 'rate_limit_hit: invalid window' using errcode = '22023';
  end if;

  if random() < 0.01 then
    delete from public.rate_limits rl
    where rl.reset_at < now() - interval '1 day';
  end if;

  return query
  insert into public.rate_limits as rl (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update
    set count = case when rl.reset_at <= now() then 1 else rl.count + 1 end,
        reset_at = case when rl.reset_at <= now() then excluded.reset_at else rl.reset_at end
  returning rl.count, rl.reset_at;
end;
$$;

comment on function public.rate_limit_hit(text, integer) is
  'Counts one request against a shared rate limit bucket and returns its count and reset time. Service role only.';

revoke all on function public.rate_limit_hit(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer) to service_role;
