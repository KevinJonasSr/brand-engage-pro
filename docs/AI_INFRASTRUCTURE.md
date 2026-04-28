# Brand Engage Pro — AI infrastructure

This doc covers the AI features ported from Fan Engage to BEP in the
"Phase E" workstream. For each phase: what it does, the file map, the
key tunables, failure modes, and what's deferred.

The original Fan Engage versions are in
`KevinJonasSr/Superfan-platform` repo at `docs/AI_INFRASTRUCTURE.md`
under the corresponding "Phase N" headings — useful when porting bug
fixes back and forth.

## Phase mapping

| BEP phase | FE source | What it ports |
|-----------|-----------|---------------|
| E.2 | FE Phase 1  | Embedding pipeline + `pgvector` foundation |
| E.3 | FE Phase 3  | AI-drafted comment replies |
| E.4 | FE Phase 6  | Semantic search across the platform |
| E.5 | FE Phase 12 | Image-aware post captions |
| E.6 | FE Phase 15 | Daily admin engagement brief |

## Schema rename map (FE → BEP)

Used throughout the port. Whenever you copy code from FE, run these
substitutions to land it cleanly on BEP:

| FE name | BEP name |
|---------|----------|
| `fans` (table) | `members` |
| `fan_id` (column) | `member_id` |
| `artist_events` (table) | `brand_events` |
| `artist_slug` (column) | `brand_slug` |
| `fan_artist_following` (table) | `member_brand_following` |
| `fan_community_memberships` (table) | `member_community_memberships` |
| `fan_badges` (table) | `member_badges` |
| `is_premium(p_fan_id, ...)` (RPC) | `is_premium(p_member_id, ...)` |
| `is_founder(p_fan_id, ...)` (RPC) | `is_founder(p_member_id, ...)` |

URL paths under `/brands/[slug]/...` are BEP convention (FE uses
`/artists/[slug]/...`). Vocabulary in prompts: "music artist" →
"brand", "fan-club platform" → "brand community platform", "fan" →
"member".

## Required env vars

In BEP Vercel:

| Var | Required for | If missing |
|-----|--------------|------------|
| `OPENAI_API_KEY` | E.2 (embeddings), E.4 (search query embedding) | Cron returns 503; `/api/search` returns 503 |
| `ANTHROPIC_API_KEY` | E.3 (drafter), E.5 (captions), E.6 (brief summarizer) | Each route returns 503; brief soft-falls to deterministic fallback narrative |
| `CRON_SECRET` | All cron routes | 401 unauthorized |
| `SLACK_ADMIN_WEBHOOK_URL` | E.6 (optional) | Briefs persist + render at /admin/briefs but no Slack delivery |

---

## Phase E.2 — Embeddings + pgvector

Foundation for E.4 (search). Future: E.6+ (reward recs, event
matching) will reuse this once those phases get ported.

### What it does

Every text-bearing row gets a 1536-dim vector embedding (OpenAI
text-embedding-3-small) stored in `content_embeddings`. A 15-min cron
finds rows missing embeddings and indexes them.

### Indexed sources

`community_posts`, `community_comments`, `communities`, `brand_events`,
`rewards_catalog`, `specials` (BEP-only — restaurant time-windowed offers).

### Files

- `setup/0026_content_embeddings.sql`
- `frontend/lib/embeddings/{client,sources,index-row,index}.ts`
- `frontend/app/api/cron/embeddings-backfill/route.ts`
- `frontend/vercel.json` — cron entry every 15 min

### Tunables

In `lib/embeddings/client.ts`:
- `EMBED_MODEL` — pinned to `text-embedding-3-small`. If swapping
  providers, also update the `vector(1536)` column type in migration
  0026.

In `app/api/cron/embeddings-backfill/route.ts`:
- `BATCH_SIZE = 50` — rows per cron tick. At every-15-min cadence
  that's 200/hour or ~4,800/day. Bump if backfill falls behind.

### Costs

OpenAI text-embedding-3-small at $0.02/1M tokens. ~80 tokens/post.
50k posts = $0.08. 1k posts/month ongoing = $0.001/month. Negligible.

### Failure modes

- **OPENAI_API_KEY missing** — cron returns 503, exits cleanly. Once
  the env var lands, next tick picks up the backlog.
- **OpenAI 5xx** — `EmbeddingError` thrown; cron logs + continues to
  the next row. The failed row stays unembedded; cron retries it.
- **Source row deleted between list_unembedded_rows + indexRow** —
  `skipped_no_row` status; row is gone, no embedding written.

---

## Phase E.3 — AI-drafted comment replies

The ✨ button in the comment composer. Click → 3 distinct-tone draft
chips. Pick one → it lands in the textarea (still editable).
`community_comments.draft_used` flag tracks A/B for engagement
analysis.

### Files

- `setup/0027_draft_used.sql`
- `frontend/lib/drafts/{client,draft-comment,index}.ts`
- `frontend/app/api/ai/draft-comment/route.ts`
- `frontend/app/brands/[slug]/community/comment-composer.tsx`
- Wire-up in `frontend/app/brands/[slug]/community/actions.ts`
  (addCommentAction reads `draft_used` from formData)

### Tunables

In `lib/drafts/client.ts`:
- `DRAFT_MODEL` — Claude Haiku 4.5
- `temperature: 0.7` — variety across the 3 drafts
- `max_tokens: 600` — fits 3 drafts × ~25 words + JSON overhead

System prompt enforces:
- Exactly 3 drafts
- ≤ 25 words each
- Each must reference something specific from the post (no "Love this!")
- 3 drafts must feel DISTINCT in stance (supportive / curious / playful)

### Costs

Claude Haiku 4.5 at $0.25/M input + $1.25/M output. Per click:
~$0.0003. 1k clicks/month = $0.30. Negligible.

### Failure modes

- **ANTHROPIC_API_KEY missing** → 503 with helpful copy
- **Anthropic 5xx** → 503 (retried by user clicking ✨ again)
- **Malformed JSON** → defensive parser throws `DraftError` → 500;
  user sees "Drafter failed."

---

## Phase E.4 — Semantic search

Public `/search?q=…` page + `<SearchInput compact />` in the global
header (lg+ breakpoints). Searches across all 6 indexed source
tables, groups results, caps 8/group.

### Pipeline

```
GET /search?q=<query>
  ↓
search(query)
  ↓ embedText(query)            // OpenAI 1536-dim vector
  ↓ search_embeddings RPC       // top-30 nearest by cosine
  ↓ filter distance ≤ 0.85      // drop noise
  ↓ batch-fetch source rows     // parallel per-table
  ↓ drop auto_hide / inactive
  ↓ group + cap PER_GROUP_LIMIT=8
  ↓ SearchResults
```

### Files

- `frontend/lib/search/{types,query,index}.ts`
- `frontend/app/api/search/route.ts`
- `frontend/app/search/page.tsx`
- `frontend/components/search-input.tsx`
- Wire-up in `frontend/app/layout.tsx` (header SearchInput)

No migration — uses `content_embeddings` from E.2.

### Tunables

In `lib/search/query.ts`:
- `RAW_LIMIT = 30` — candidates from pgvector before grouping
- `PER_GROUP_LIMIT = 8` — max per source_table on results page
- `MIN_QUERY_LENGTH = 2` — empty/single-letter queries gated
- `MAX_DISTANCE = 0.85` — cosine threshold above which hits drop as noise

### Costs

OpenAI text-embedding-3-small per query: ~10 tokens = $0.0000002.
1M queries/month ≈ $0.20.

### Failure modes

Same as E.2 — `OPENAI_API_KEY` missing returns 503; OpenAI 5xx returns 503.

---

## Phase E.5 — Image-aware post captions

Mirror of E.3 but for image posts. ✨ Suggest captions button
appears below the image upload preview when an image is attached.
3 caption chips in distinct tones (observational / enthusiastic /
curious). `community_posts.caption_used` flag for A/B telemetry.

### Files

- `setup/0028_caption_used.sql`
- `frontend/lib/captions/{client,index}.ts`
- `frontend/app/api/ai/caption-image/route.ts`
- `frontend/app/brands/[slug]/community/caption-suggester.tsx`
- Wire-up in `frontend/app/brands/[slug]/community/new-post-form.tsx`
  + `actions.ts` (createPostAction reads `caption_used` from formData)

### Why opt-in (button must be clicked)

We don't auto-fire on every upload because:
1. It would burn Anthropic spend on photos members never publish
2. Some members want to type their own caption immediately
3. Click-vs-skip is a clean A/B signal post-launch

If post-launch data shows >40% adoption and >15% reactions lift on
caption_used=true posts, consider flipping to auto-prefill mode (one
extra Claude call per upload, saves the click).

### Tunables

In `lib/captions/client.ts`:
- `CAPTION_MODEL` — Claude Haiku 4.5 (vision)
- `temperature: 0.7` — distinct tones across 3 captions
- `max_tokens: 400`
- System prompt enforces: 3 captions, ≤100 chars each, must
  reference visible content, 3 distinct tones

### Costs

~1600 input tokens (image) + ~150 output × 3 captions = ~$0.0007 per
click. 1k photo posts/month with ✨ clicked on every one = $0.70.

### Failure modes

- API key missing → 503
- Anthropic 5xx → 503
- Image fetch fails on Anthropic side (e.g., bucket isn't public) →
  `CaptionError` → 503. Verify Supabase Storage bucket
  `community-uploads` has public read.

---

## Phase E.6 — Daily admin engagement brief

Cron at 13:00 UTC daily summarizes platform + per-community
week-over-week metrics into a Slack-ready narrative. Persists to
`admin_briefs`; optional Slack delivery.

### Pipeline

```
13:00 UTC daily
  ↓ GET /api/cron/daily-admin-brief
  ↓ gatherAdminBriefMetrics(now)
    - per-brand: posts / comments / reactions / signups /
      active_members / top_post (this week vs last week)
    - platform totals + global signups + total points awarded
    - rule-based anomaly detection
  ↓ summarizeAdminBrief(metrics)
    - Claude Haiku 4.5 (or deterministic fallback)
    - Plain-text Slack-ready, ≤80 lines
  ↓ persistAndDispatchBrief(metrics, summary, ms)
    - INSERT admin_briefs (always)
    - POST Slack webhook if SLACK_ADMIN_WEBHOOK_URL set
    - Stamp channels_sent
```

### Files

- `setup/0029_admin_briefs.sql`
- `frontend/lib/admin-brief/{gather,summarize,send,index}.ts`
- `frontend/app/api/cron/daily-admin-brief/route.ts`
- `frontend/app/admin/briefs/page.tsx`
- `frontend/vercel.json` — `0 13 * * *` schedule
- Wire-up in `frontend/app/admin/layout.tsx` (Briefs nav entry)

### Anomaly thresholds (in `gather.ts`)

- Signup spike: 3x+ vs prior week → `warn`
- 10+ signups from a quiet baseline → `info`
- Posts went N>0 to 0 → `no_activity` `warn`
- Engagement (reactions+comments) drop ≥ -20% → `engagement_drop`
  (warn at ≥ -40%)
- Engagement jump ≥ +20% → `engagement_jump` `info`

### Costs

Claude Haiku 4.5 at ~$0.0009 per run. Daily = ~$0.027/month.

### Honest scope notes (deferred to v2)

- **IP-block bot detection** — `members` doesn't track signup IPs.
  Adding requires either a `members.signup_ip inet` column populated
  by signup flow, OR pulling from `auth.audit_log_entries`.
- **Per-community points attribution** — `points_ledger` is global
  (no `community_id` column). Brief surfaces platform-total points
  awarded only.
- **Email channel** — Slack covers typical admin teams. Email is a
  v2 add (Resend recommended over Mailchimp for transactional).

---

## What's NOT yet ported from Fan Engage (Phase F backlog)

The Phase E port focused on the "high-value 5" features. Five more
FE phases remain unported:

| FE phase | What | Why deferred |
|----------|------|--------------|
| FE Phase 2  | Spam/abuse moderation | Defensive, not urgent without volume |
| FE Phase 4  | Smart digest emails | Needs Mailchimp config first |
| FE Phase 5  | Auto-tagging community posts | Needs new restaurant-vertical canonical tag vocabulary (FE's 21 tags are music-specific) |
| FE Phase 8  | Smart event match notifications | Depends on follower volume |
| FE Phase 10 | Reward recommendations | Depends on redemption history |

Plus FE Phases 7 (personalized feed — volume-gated) and 11 (voice
submissions — accessibility add) are deferred to v3 per the FE recs
doc.

The Phase F port is a separate workstream when BEP has more content
to operate on. Most of these become high-value once Nellie's has 3+
months of post / event / redemption history.

