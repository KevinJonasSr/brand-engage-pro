# AI #17 fraud detection v1 (BEP)

BEP mirror of `_ai17_fraud_detection_bundle/`. Same architecture; uses
`members` table + `member_id` column. Migration already applied via
Chrome MCP (table + indexes + admin-only RLS policy).

## Files

- `lib_detect.ts` → `frontend/lib/fraud-detection/index.ts`
- `cron_route.ts` → `frontend/app/api/cron/fraud-scan/route.ts`
- `patch_vercel_json.py` — adds `0 3 * * *` cron entry
- `admin_page.tsx` → `frontend/app/admin/fraud-signals/page.tsx`
- `admin_actions.ts` → `frontend/app/admin/fraud-signals/actions.ts`
- `apply.sh`

## Apply

```bash
bash _bep_fraud_detection_bundle/apply.sh
git push
```

## Smoke test

After deploy, click Run on `/api/cron/fraud-scan` via
https://vercel.com/jonas-group/brand-engage-pro/settings/cron-jobs
— expect zero candidates. Then verify the admin page renders at
https://brand-engage-pro-jonas-group.vercel.app/admin/fraud-signals
(empty state).

Cost identical to FE: ~$0.001/day.
