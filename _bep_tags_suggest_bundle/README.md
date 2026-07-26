# AI #5 fan-facing TagSuggester (BEP)

BEP mirror of `_ai_tags_suggest_bundle/`. Member types post body →
clicks "✨ Suggest tags" → Claude returns 1-3 tags → member toggles
chips → tags ride along with submit and merge into
`community_posts.tags`.

## Migration first

**BEP does NOT yet have `community_posts.tags`** (M-2 was a UI-only
port). Run `migration_tags.sql` in BEP Supabase BEFORE applying
the code bundle, otherwise inserts will fail.

The migration is additive and idempotent:
- Adds `community_posts.tags TEXT[]`
- Adds GIN index on `tags`

## Files

- `migration_tags.sql` — apply in BEP Supabase first
- `lib_suggest.ts` → `frontend/lib/tagging/suggest.ts`
- `api_route.ts` → `frontend/app/api/ai/suggest-tags/route.ts`
- `tag_suggester.tsx` → `frontend/components/community/tag-suggester.tsx`
- `hotfix.sh` — installs files, patches actions.ts + new-post-form.tsx,
  type-checks, commits everything (this script combines what was split
  across apply.sh and hotfix.sh on FE — single command)

## Schema map FE → BEP

- `artists` → `brands`
- `artist_slug` → `brand_slug`
- `artistSlug` prop → `brandSlug`
- `fans` → `members` (irrelevant here; we don't query members)
- `community_posts.tags` — same column name on both apps

## Apply

1. Run `migration_tags.sql` in BEP Supabase SQL editor (I'll drive
   this via Chrome MCP)
2. Then locally:

   ```bash
   cp -r "$HOME/Library/.../outputs/_bep_tags_suggest_bundle" "$HOME/brand-engage-pro/"
   cd "$HOME/brand-engage-pro"
   bash _bep_tags_suggest_bundle/hotfix.sh
   git push
   ```

## Smoke test

1. Visit https://brand-engage-pro-jonas-group.vercel.app/brands/nellies/community
2. Open the composer, type a post body about an upcoming class
3. Click "✨ Suggest tags"
4. Toggle chips, then submit
5. Confirm post renders with the chosen tags

## Cost

~$0.0001 per suggestion call. Negligible at BEP's current volume.
