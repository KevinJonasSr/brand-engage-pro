# Live database tests

These scripts check the real database behavior of Brand Engage Pro: redemptions,
points, and brand-admin scoping. They are not part of `npm test` and never run in CI.

**Do not run any of these against prod without Kevin's explicit yes.**
The BEP prod ref is `enfpviapxvqyoarwwsuf`. Never point them at the Fan Engage Pro
project (`uhovonrljcauaoctypbg`).

## The scripts

| File | What it checks | Leaves anything behind? |
|------|----------------|-------------------------|
| `01_redemption_cancel_refund.sql` | Redeem takes points and stock, cancel gives both back, one spend row and one refund row in the ledger, and the guard rails (double cancel, wrong brand, fulfilled, out of stock, inactive, someone else's redemption, anon, direct calls to service-role functions) | No. One transaction, ends in `ROLLBACK`. No network events are sent. |
| `02_concurrent_points.sh` | 20 parallel point awards add up exactly, a duplicate ledger row is blocked, and two redemptions at the same moment cannot overdraw a member | Briefly. It commits its fixtures (parallel sessions need that), sends `member.joined` and `points.awarded` events to the hub for the test member, and shows two "LIVE TEST race" rewards in jonas-group for a few seconds. It deletes everything at the end, even on failure. |
| `03_brand_admin_scoping.sql` | A Nellie's-only admin cannot see or change another brand's specials or redemptions, cannot add specials to another brand, and cannot promote themselves to a `*` admin | No. One transaction, ends in `ROLLBACK`. |

Test users use `live-test+<uuid>@example.invalid` addresses. Test rows are titled `LIVE TEST ...`.

## How to run

You need `psql` and a database URL with the `postgres` role (Supabase dashboard,
Project Settings, Database, connection string). Prefer a Supabase branch or a local
stack (`supabase start`).

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/live/01_redemption_cancel_refund.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/live/03_brand_admin_scoping.sql
DATABASE_URL=... supabase/tests/live/02_concurrent_points.sh
```

02 refuses to run on BEP prod unless `BEP_LIVE_TEST_ALLOW_PROD=yes` is set, and
refuses the FEP project always.

Each check prints `PASS  <label>`. The SQL scripts stop at the first `FAIL` and
throw the transaction away. 02 runs every check, then exits 1 and prints the
worker output if any failed.

## Known results today (2026-09-28)

- **02, overdraft race: expected to FAIL.** `redeem_reward` locks the reward row
  but not the member row, and there is no `total_points >= 0` check, so two
  redemptions at the same instant can both succeed and push a member below 0.
  The fix (lock the member row, add a check constraint) would be migration 0070
  and needs Kevin's yes.
- **03, fraud_signals: prints a `FINDING` warning, not a failure.** The policy
  `fraud_signals_super_admin_all` lets any row in `admin_users` through, so a
  Nellie's-only admin can read and edit fraud signals for every member. It should
  require `community_id = '*'`. Also a 0070 candidate.
