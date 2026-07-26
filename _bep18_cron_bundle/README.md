# AI #18 — Cron auto-generation for brand post drafts (BEP)

BEP mirror of FE's `_ai18_cron_bundle/`. Daily cron that surveys
active brands, finds quiet communities, and auto-generates a draft
for each. Admin opens `/admin/post-drafts` in the morning and finds
suggestions ready to review.

## Logic

For each brand with `active = true`:
1. Skip if a pending draft already exists (don't pile up)
2. Skip if community has 3+ posts in the last 5 days (not quiet)
3. Skip if no events/posts/comments to draft from (no-context guard)
4. Otherwise: gather context (upcoming events + recent admin posts +
   member comments) → Claude → save draft

Cap at 20 brands per cron tick.

## Schema differences from FE

- `artists` → `brands`
- `artist_slug` → `brand_slug`
- `artist_events` → `brand_events`
- `event_date` → `event_starts_at` (timestamptz, added in F-2)
- `fans` → `members`
- `artist_post_drafts` → `brand_post_drafts`
- `community_posts` and `community_comments` keep their names; just
  scoped by `brand_slug` instead of `artist_slug`

## Files

- `cron_route.ts` → `frontend/app/api/cron/post-drafts/route.ts`
- `patch_vercel_json.py` — adds `0 13 * * *` cron entry

## Apply

```bash
bash _bep18_cron_bundle/apply.sh
```

## Smoke test (after deploy)

Trigger manually via Vercel Cron Jobs settings page (Run button) — easier
than curl since `CRON_SECRET` is "Sensitive" on Vercel and can't be
revealed:
- https://vercel.com/jonas-group/brand-engage-pro/settings/cron-jobs

Returns `{ ok, scanned, generated, skipped_pending, skipped_active, errors, details }`.
Then visit each brand's `/admin/post-drafts` page to see queued drafts.

## Cost

~$0.0001 per draft × ~20 brands max/day = $0.002/day = under $1/year.
