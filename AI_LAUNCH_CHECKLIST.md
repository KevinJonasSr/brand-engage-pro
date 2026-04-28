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

