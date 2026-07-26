# AI #7 Personalized feed v1 — "Picked for You" tile (BEP)

BEP mirror of `_ai7_personalized_feed_bundle/`. Same scoring algorithm,
same UI; reads from `members.interest` and filters by `brand_slug`.

## Schema map FE → BEP

- `fans.interest` → `members.interest`
- `artist_slug` → `brand_slug`
- `fanId` prop → `memberId` prop

## Files

- `lib_compute.ts` → `frontend/lib/personal-feed/compute.ts`
- `picked_for_you.tsx` → `frontend/components/personal/picked-for-you.tsx`
- `patch_community_page.py` — wires `<PickedForYou />` into
  `frontend/app/brands/[slug]/community/page.tsx`
- `apply.sh`

## Apply

```bash
bash _bep_personalized_feed_bundle/apply.sh
git push
```

## Smoke test

Visit https://brand-engage-pro-jonas-group.vercel.app/brands/nellies/community
while signed in. Should see "✨ You might have missed" tile with up to
3 cards above the feed (or "Picked for you" if your member.interest
matches one of Nellie's post tags).

Cost: $0 — no Claude calls.
