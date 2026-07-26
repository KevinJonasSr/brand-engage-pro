# Alt-text Phase 1+2 (BEP)

BEP mirror of the FE alt-text feature, combining Phase 1 (auto-suggest
on upload + write to DB) and Phase 2 (render + backfill cron) into one
bundle since BEP is starting fresh on alt text.

`community_posts.image_alt` already added via Chrome MCP migration.

## Architecture

- `<AltTextSuggester />` auto-fires on image upload (no button).
- Server-side: `/api/ai/alt-text` calls Claude vision, returns one-line
  description ≤200 chars.
- Backfill cron `/api/cron/alt-text-backfill` fills in any post that
  has an image but no alt text yet (steady-state $0).
- Render: `<img alt={post.image_alt ?? ""} />` in post-card.

## BEP-specific differences from FE

- Composer file: `frontend/app/brands/[slug]/community/new-post-form.tsx`
- Schema: `community_posts.brand_slug` (not artist_slug)
- API route uses `brandSlug` param
- AltTextSuggester takes `brandSlug` prop
- BEP composer doesn't currently wire `imageUrl` state. The hotfix
  script adds that state if missing, plus the `onUploaded` handler
  wiring, similar to how we added `body` state for TagSuggester.

## Files

- `lib_alt.ts` → `frontend/lib/alt-text/generate.ts`
- `api_route.ts` → `frontend/app/api/ai/alt-text/route.ts`
- `cron_backfill_route.ts` → `frontend/app/api/cron/alt-text-backfill/route.ts`
- `alt_text_suggester.tsx` → `frontend/components/community/alt-text-suggester.tsx`
- `apply.sh` — installs files, patches vercel.json + composer + actions
  + types + select + post-card render, type-checks, commits

## Apply

```bash
bash _bep_alt_text_bundle/apply.sh
git push
```

After deploy, manually trigger the backfill cron once to chew through
the 1 existing BEP image post (Vercel cron-jobs page → Run on
`/api/cron/alt-text-backfill`).
