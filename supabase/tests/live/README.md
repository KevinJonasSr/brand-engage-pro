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

## Known results (2026-09-28)

- **01 on prod: all 24 checks passed and rolled back after 0070.** Before 0070
  the fixture's first point award failed with `42883 operator does not exist:
  tier_slug = text` inside `bump_membership_points`. Since 0046 that function
  stored the tier in a `text` variable, so every non-zero point award for a member
  who already belongs to the brand failed (award triggers, `cancel_redemption`
  refunds, the 0067 pre-join move). 0070 was applied to prod 2026-09-28.
- **02, overdraft race: fails before 0070.** `redeem_reward` locked the reward row
  but not the member row, and there was no `total_points >= 0` check, so two
  redemptions at the same instant could both succeed and push a member below 0.
  0070 locks the member row and adds the check. Not run on prod yet (it commits
  fixtures and sends hub events, so it needs its own yes).
- **03 on prod: all 13 checks passed and rolled back after 0070.** Before 0070, a
  Nellie's-only admin could read fraud_signals for every member (the policy let
  any `admin_users` row through). 0070 limits it to `*` admins, and 03 now fails
  on a database without 0070.
