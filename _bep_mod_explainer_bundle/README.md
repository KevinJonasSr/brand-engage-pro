# Moderation explainer (BEP) — fan-facing reason chip

BEP mirror of `_ai_mod_explainer_bundle/`. Same architecture:

- New column `community_posts.moderation_user_message` (already added
  via Chrome MCP migration before this bundle ships)
- `lib/moderation/explain-user.ts` — Claude Haiku generates 1-sentence
  member-facing message
- `/api/cron/moderation-explain` runs `*/15 * * * *`, processes
  auto_hide posts where user_message IS NULL
- `<ModerationChip />` server component renders amber 🛡️ chip
  on the post when status === "auto_hide"

Brand-rebranded prompt (members instead of fans, brand instead of
artist).

## Apply

```bash
bash _bep_mod_explainer_bundle/apply.sh
git push
```

## Cost

Same as FE: ~$0.0001/explanation, $0 steady-state.
