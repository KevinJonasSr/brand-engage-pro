# Brand Engage Pro — AI launch checklist

Pre-launch metrics, smoke tests, and content-threshold gates for the
five AI features ported in Phase E. Each section is self-contained:
SQL to verify health, smoke-test steps, and a "don't bother running
this until X" gate so you don't false-positive on empty platform.

---

## Pre-launch env-var checklist

- [ ] `OPENAI_API_KEY` set in BEP Vercel
- [ ] `ANTHROPIC_API_KEY` set in BEP Vercel
- [ ] `CRON_SECRET` set (matches every cron request's Bearer token)
- [ ] (Optional) `SLACK_ADMIN_WEBHOOK_URL` set for Phase E.6 Slack delivery

Without the first two, all AI features 503 gracefully — no crashes,
just no AI output.

---

## 🧠 Phase E.2 — Embeddings + pgvector

### Cron heartbeat (rows getting indexed)

```sql
select source_table, count(*) as embedded
from public.content_embeddings
group by 1
order by 1;
```

Expect non-zero counts in `community_posts`, `community_comments`,
`communities`, `brand_events`, `rewards_catalog`, `specials` once
each table has rows. Zero in any of them means either the table
itself is empty or the cron has a bug — check Vercel logs for
`/api/cron/embeddings-backfill`.

### Backlog size (should trend toward zero)

```sql
select * from public.list_unembedded_rows(100);
```

Should return < BATCH_SIZE rows after a few cron ticks. If it
consistently returns > BATCH_SIZE, bump BATCH_SIZE in
`/api/cron/embeddings-backfill/route.ts`.

### Smoke test (run when there's something to embed)

Don't bother until at least the Phase D seed has run (Nellie's
community + brand + 4 specials + welcome announcement).

1. Verify content_embeddings has at least 6 rows after 1-2 cron
   ticks (1 community + 1 post + 4 specials).
2. Manually fire the cron:
   ```bash
   curl -i -H "Authorization: Bearer $CRON_SECRET" \
     https://YOUR_BEP_DOMAIN/api/cron/embeddings-backfill
   ```
   Expected: `200 { ok: true, summary: { processed: N, byStatus: { skipped_unchanged: N }, ... }}`.
   Re-running should report mostly `skipped_unchanged` (idempotent).
3. Verify HNSW index is being used:
   ```sql
   explain select id from public.content_embeddings
   order by embedding <=> (select embedding from content_embeddings limit 1)
   limit 5;
   ```
   Should show "Index Scan using content_embeddings_hnsw_idx".

---

## ✨ Phase E.3 — AI-drafted comment replies

### Adoption rate

```sql
select
  count(*) as comments,
  count(*) filter (where draft_used) as drafted,
  round(100.0 * count(*) filter (where draft_used) / nullif(count(*), 0), 1) as draft_pct
from public.community_comments
where created_at > now() - interval '14 days';
```

Reading: < 10% drafter share = button isn't being seen (consider
making ✨ more prominent). > 40% = members love it (consider
extending — see V2 ideas in AI_INFRASTRUCTURE.md). 10-30% is the
healthy range.

### A/B comparison (works once ~50+ comments)

```sql
select draft_used,
       count(*) as comments,
       avg(length(body))::int as avg_chars
from public.community_comments
where created_at > now() - interval '14 days'
group by 1;
```

The hypothesis from the FE recs doc: drafted comments → +30%
comment volume vs unassisted. If you don't see that lift after
50+ each side, the prompt needs tuning.

### Smoke test (when there's at least one post to comment on)

1. Sign in to BEP. Navigate to any brand community (Nellie's
   welcome post will exist after Phase D seed).
2. Click ✨ on the comment composer. Within ~3 seconds, 3 distinct
   draft chips appear.
3. Pick one → it lands in the textarea.
4. Edit lightly + post.
5. Verify in DB:
   ```sql
   select id, body, draft_used, created_at
   from public.community_comments
   order by created_at desc limit 1;
   ```
   `draft_used` should be `true`. The body contains the draft text
   (with any edits).
6. Make a fresh comment without clicking ✨. `draft_used` should be
   `false`. Confirms the flag isn't sticky across posts.

---

## 🔍 Phase E.4 — Semantic search

### Embedding coverage check

```sql
-- Must be non-zero for searches to return anything.
select source_table, count(*)
from public.content_embeddings
group by 1;
```

Same as the E.2 heartbeat — search is downstream of embeddings.

### Visibility filter sanity

```sql
-- Only public-visibility embeddings should be returned for anonymous
-- callers. Run with the auth context set to anon to verify RLS.
select count(*) from public.content_embeddings;
-- Compare to:
select count(*) from public.content_embeddings where visibility = 'public';
```

If anon-context returns the second number, RLS is working. If it
returns the first, something's wrong with the policies.

### Smoke test (when there's content to search)

Don't bother until at least 5+ posts + 3+ specials exist on Nellie's.

1. Visit `/search?q=biscuit`. Should return Nellie's "Bottomless
   Biscuits" special.
2. Visit `/search?q=southern`. Should return both the brand
   community card AND the welcome post.
3. Visit `/search?q=zzzzz`. Should return the friendly "no results"
   empty state, not a crash.
4. Visit `/search?q=a` (single letter). Should return the prompt
   page without burning an OpenAI call (verify in Vercel runtime
   logs — no `embedText` call should fire).
5. Header bar visible at desktop (≥ lg breakpoint) — submitting it
   should route to /search?q=...

---

## 📷 Phase E.5 — Image-aware post captions

### Adoption rate

```sql
select
  count(*) as photo_posts,
  count(*) filter (where caption_used) as ai_captioned,
  round(100.0 * count(*) filter (where caption_used)
        / nullif(count(*), 0), 1) as ai_caption_pct
from public.community_posts
where image_url is not null
  and created_at > now() - interval '14 days';
```

Same heuristics as E.3 — < 5% means button isn't being seen, > 40%
means flip to auto-prefill consideration.

### Engagement A/B

```sql
with photo_posts as (
  select p.id, p.caption_used,
    (select count(*) from public.community_comments c where c.post_id = p.id) as comments,
    (select count(*) from public.community_reactions r where r.post_id = p.id) as reactions
  from public.community_posts p
  where p.image_url is not null
    and p.created_at > now() - interval '30 days'
)
select caption_used, count(*) as posts,
       round(avg(comments)::numeric, 2) as avg_comments,
       round(avg(reactions)::numeric, 2) as avg_reactions
from photo_posts group by 1;
```

Hypothesis: caption_used=true posts have higher reactions (specific
captions catch attention).

### Smoke test (when there's a real photo to upload)

1. Sign in. New post on Nellie's. Attach any image.
2. Suggester panel appears below upload preview.
3. Click ✨ Suggest captions. 3 chips appear within ~3s with
   distinct tones (one observational, one enthusiastic, one
   curious-question).
4. Click chip #2. Caption appears in textarea. If you'd already
   typed something, the caption is appended (with space), not
   replacing.
5. Submit. Verify in DB:
   ```sql
   select id, body, caption_used, created_at from public.community_posts
   where image_url is not null order by created_at desc limit 1;
   ```
   `caption_used` should be `true`.
6. Skip path: new post with image, type caption manually. Should
   land with `caption_used=false`.

---

## 📰 Phase E.6 — Daily admin brief

### Cron heartbeat (must be writing rows daily)

```sql
select date_trunc('day', created_at) as day,
       count(*) as briefs,
       array_agg(channels_sent) as channels
from public.admin_briefs
where created_at > now() - interval '14 days'
group by 1
order by 1 desc;
```

Exactly one row per day. Gap = check Vercel logs for
`/api/cron/daily-admin-brief`.

### Slack delivery rate

```sql
select count(*) filter (where 'slack' = any(channels_sent)) as slack_delivered,
       count(*) as total
from public.admin_briefs
where created_at > now() - interval '30 days';
```

If `slack_delivered = 0` but `total > 0`, `SLACK_ADMIN_WEBHOOK_URL`
isn't configured or is wrong. Check Vercel env.

### Anomaly volume sanity (post-launch)

```sql
select date_trunc('day', created_at) as day,
       jsonb_array_length(metrics->'anomalies') as total,
       (select count(*) from jsonb_array_elements(metrics->'anomalies') a
        where a->>'severity' = 'warn') as warn_count
from public.admin_briefs
where created_at > now() - interval '30 days'
order by 1 desc;
```

A spike in warn_count usually means a real problem worth investigating.

### Smoke test (when there's any activity to summarize)

Don't bother until at least one brand has activity in two adjacent weeks.

1. Manually trigger:
   ```bash
   curl -i -H "Authorization: Bearer $CRON_SECRET" \
     https://YOUR_BEP_DOMAIN/api/cron/daily-admin-brief
   ```
   Expected: 200 with `{ ok: true, brief_id: "...", channels_sent: [...], took_ms: ... }`.
2. Sign in as admin. Visit `/admin/briefs`. Latest brief expanded
   by default; older ones collapsed.
3. Narrative is plain text, ≤ 80 lines, no markdown table garbage,
   references specific brand names + concrete numbers.
4. (If Slack configured) Slack channel receives the same summary.
5. Temporarily unset `ANTHROPIC_API_KEY` and re-run cron. Brief
   persists with deterministic non-AI fallback narrative. Re-set
   the key after testing.
6. Empty platform: drop all brand `active=true` flags temporarily.
   Cron should produce "Quiet week" summary, not error out.

---

## Cross-phase pre-launch gates

### Content threshold (when AI features actually become useful)

| Feature | Useful when |
|---------|-------------|
| Embeddings + Search | Any 5+ rows across indexed tables |
| Drafted comments | ≥ 1 active brand with ≥ 1 post worth replying to |
| Image captions | ≥ 1 fan account willing to upload a real photo |
| Admin brief | At least 1 brand with WoW activity in two adjacent weeks |

Below these thresholds, smoke tests will produce "thin" output that
isn't representative.

### When to enable

All five features are technically operational the moment migration
0029 lands (already done). The user-visible value comes online
incrementally as content accumulates. There is no separate
"feature flag" gate — they're additive.

### Cost budget at full scale

| Feature | Per-event cost | Monthly @ 1k events |
|---------|---------------|---------------------|
| Embeddings | $0.000002/post | $0.001/mo at 1k posts |
| Drafted comments | $0.0003/click | $0.30/mo at 1k clicks |
| Image captions | $0.0007/click | $0.70/mo at 1k clicks |
| Admin brief | $0.0009/day | $0.027/mo |
| Search query | $0.0000002/query | $0.20/mo at 1M queries |

Total AI bill at 1k posts/month + 1k drafter clicks + 1k captions +
daily brief + light search: **under $1.50/month**. Well under any
plausible founder-tier budget.

---

## What's NOT in this checklist (yet)

The Phase F backlog (FE phases 2, 4, 5, 8, 10) hasn't been ported
yet. When those land, each gets its own metrics + smoke test
section. See `docs/AI_INFRASTRUCTURE.md` "What's NOT yet ported"
for the deferred list.


---

## Post-launch cleanup — orphan brand_events (2026-04-28)

The first prod run of `/api/cron/embeddings-backfill` indexed 16 of 20
candidate rows successfully. The remaining 4 errored with:

```
insert or update on table "content_embeddings"
violates foreign key constraint "content_embeddings_community_id_fkey"
```

Root cause: those 4 rows in `public.brand_events` have a `brand_slug`
value that doesn't exist in `public.communities.slug`. The embeddings
cron uses `brand_slug` as the `community_id` (FK'd to
`public.communities.slug`), so any orphan event fails to embed.

Affected row IDs (as of the 2026-04-28 cron run):

- `cb240645-7246-4ba5-a8f5-2546997a5918`
- `4eed44d4-0d2e-4fe0-b8e7-472fd63a3e8c`
- `05fcb393-c0bc-4de0-b337-03434e4b097e`
- `fb1c7d25-f821-4436-b99f-cded9d1d9365`

### Diagnostic SQL

Run in the Supabase SQL editor to see what's stale:

```sql
-- 1. The 4 orphan events with their brand_slug
select id, brand_slug, title, active
from public.brand_events
where id in (
  'cb240645-7246-4ba5-a8f5-2546997a5918',
  '4eed44d4-0d2e-4fe0-b8e7-472fd63a3e8c',
  '05fcb393-c0bc-4de0-b337-03434e4b097e',
  'fb1c7d25-f821-4436-b99f-cded9d1d9365'
);

-- 2. All known communities for slug comparison
select slug, display_name from public.communities order by slug;

-- 3. Generic version — any active event whose brand_slug is missing from communities
select distinct ev.brand_slug
from public.brand_events ev
left join public.communities c on c.slug = ev.brand_slug
where ev.active = true
  and c.slug is null;
```

### Fix paths (pick whichever applies)

- **Slug mismatch** (e.g. `nellies-southern-kitchen` vs `nellies`):
  `update public.brand_events set brand_slug = '<correct-slug>' where id in (...);`
  then re-run the cron.

- **Stale seed events for a brand that no longer exists**:
  `update public.brand_events set active = false where id in (...);`
  This silently drops them from the backfill candidate set.

- **Brand exists but community row was never created**:
  insert the missing row in `public.communities` with the matching slug,
  then re-run the cron.

### Re-run after fix

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  https://brand-engage-pro.vercel.app/api/cron/embeddings-backfill
```

Expected: `byStatus.error` drops to 0 and `byStatus.indexed` matches
the new candidate count.

### Hardening (future, not urgent)

If orphans keep appearing, add a `where ev.brand_slug in (select slug from public.communities)` clause to the `brand_events` branch of `public.list_unembedded_rows()` in a future migration. Defers indexing of orphans cleanly instead of erroring on every cron tick.

## 🔐 BEP OAuth re-enable (post custom auth domain)

Mirror of the FE-side OAuth gate. Real-user testing on FE surfaced the Google consent screen showing the raw Supabase project URL — same issue applies to BEP. OAuth buttons hidden on /signup until BEP has a custom auth domain.

- [ ] **Configure BEP Supabase custom auth domain** — Supabase Pro setting; e.g. `auth.brandengagepro.com` or `auth.<custom>.com`. Without this, the Google consent screen shows the raw BEP Supabase project URL (`enfpviapxvqyoarwwsuf.supabase.co`).
- [ ] **Update BEP Google OAuth client redirect URIs** in Cloud Console to point at the custom auth domain.
- [ ] **Update Apple OAuth Service ID redirect** to match (if/when Apple SSO is wired up; currently deferred per the FE-side memory).
- [ ] **Submit BEP Google OAuth consent screen for verification** so 'Brand Engage Pro' appears prominently instead of the redirect host.
- [ ] **Restore OAuth buttons** in `frontend/app/signup/signup-client.tsx` — git history has the original block at the commit before this gate landed. Revert that hunk to bring them back.

Until all of the above are done, signup is email-only.

## 📣 Shareability infrastructure (mirrored from Fan Engage)

- [x] **`<ShareButton />`** component at `frontend/components/share-button.tsx` — Web Share API on mobile, clipboard fallback on desktop.
- [x] **Per-brand OG card** at `frontend/app/brands/[slug]/opengraph-image.tsx` — generates beautiful preview when /brands/<slug> URLs are shared.
- [x] **Founding Member share page** at `frontend/app/share/founder/[slug]/[number]/page.tsx` plus matching OG card. Counts are public, member identity not exposed.
- [x] **Hero share button** wired into `/brands/<slug>` next to FollowButton. Anonymous-friendly (outside `isSignedIn` conditional).

### Manual smoke test after deploy

1. Open `/brands/raelynn` (or any active brand) on mobile → tap Share → verify native sheet opens with brand name + tagline.
2. Open `/brands/raelynn` on desktop → click Share → verify "Link copied" toast.
3. Visit `/share/founder/raelynn/1` directly → verify certificate page renders.
4. Visit OG card at `/brands/raelynn/opengraph-image` and `/share/founder/raelynn/1/opengraph-image` → verify both render to PNG without error.
5. Paste `/brands/raelynn` URL in iMessage/Slack → verify the per-brand card appears in the unfurl.

### Future wiring (Bundle 4)

- [ ] Profile-discovery share moments on `/premium/welcome` (member's founder share entry point).
- [ ] Share trigger on rewards redeem success state.
- [ ] Award founder-member badge using `award_badge` RPC with `p_member_id` (BEP) — confirm slug `founder-member` exists in BEP `badges` table.

## 👤 Public member profile pages (mirrored from Fan Engage)

- [x] Migration 0032 — adds `handle` + `public_profile_enabled` to `members`, with backfill + unique index + BEFORE INSERT trigger.
- [ ] **Run 0032 in BEP Supabase** (project `enfpviapxvqyoarwwsuf`). Verify with: `select count(*) filter (where handle is null), count(*) from public.members;` → expect (0, total).
- [x] `lib/data/member-profile.ts` — public-only data fetcher. Strips email, phone, stripe ids, last login, moderation flags. Returns `null` on opt-out so the route 404s without confirming handle existence.
- [x] `/members/[handle]/page.tsx` — header, stats, founder badges, regular badges, brands followed, ShareButton.
- [x] `/members/[handle]/opengraph-image.tsx` — tier-colored 1200x630 OG card with founder count.
- [x] UserMenu — "My profile" link wired up when `member.handle` is set.

### Manual smoke test after deploy

1. Sign in as a real member.
2. Open the user menu → click "My profile" → verify the page renders.
3. Visit `/members/<your-handle>/opengraph-image` → verify PNG renders with tier color.
4. Toggle `public_profile_enabled = false` for a test member in Supabase → reload `/members/<that-handle>` → expect 404.
5. Paste `/members/<your-handle>` in iMessage/Slack → verify member-profile preview unfurls.

### Future opt-out UI

The DB-side opt-out works (set `public_profile_enabled = false`) but no UI exists yet. Add a toggle on `/me` or `/me/settings` in a follow-up bundle.

