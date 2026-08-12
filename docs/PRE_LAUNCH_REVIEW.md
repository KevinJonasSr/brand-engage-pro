# Brand Engage Pro — Pre-Launch Readiness Review

> **Superseded for full dual coverage by [`docs/GUEST_AND_CODE_REVIEW.md`](./GUEST_AND_CODE_REVIEW.md)** (code **and** guest journey).  
> Keep this file as the short status tracker for the original P0/P1 code findings from PR #5.

**Date:** 2026-08-12 (re-verified same day)  
**Repo:** `KevinJonasSr/brand-engage-pro` @ `main` (`e24b443`)  
**Live:** https://brand-engage-pro.vercel.app  
**Supabase project (from live debug probe):** `enfpviapxvqyoarwwsuf`

### Product framing (binding)

**BEP = brand ↔ loyal customer/member** (restaurants, salons, gyms, etc.). **Not** a music/superfan app — that is **Fan Engage Pro**. Leftover music/fan/artist copy is a **guest-experience bug**. Nellie's must feel like **restaurant loyalty**, not a musician fan club. Details: `GUEST_AND_CODE_REVIEW.md`.

---

## Safe to launch?

**Not on current production until P0s clear.** After **[PR #7](https://github.com/KevinJonasSr/brand-engage-pro/pull/7)** deploys + probe-user purge, a **Nellie's SMS-only soft launch** with one trusted admin is plausible only if guest music/fan leftover bugs on the member path are also fixed (plus P1s: RLS, Turnstile/#6). Multi-brand / multi-admin is **not** safe.

Fan Engage launches first — see “must vs wait” table in `GUEST_AND_CODE_REVIEW.md`.

---

## P0 status (re-verified on main)

| # | Finding | Paths | Status on main | Fix |
|---|---|---|---|---|
| 1 | `/api/debug-supabase` unauthenticated; leaks key prefixes; creates Auth probe users | `frontend/app/api/debug-supabase/route.ts` | **Still live (200)** | PR #7 deletes route |
| 2 | Admin broadcast email unscoped (full Mailchimp audience); tier IDs unused | `admin/broadcast/actions.ts`, `lib/broadcast.ts` | **Still broken** | PR #7 disables email; SMS-only |
| 3 | Cron auth not uniformly fail-closed (8/14 fail-open; HANDOFF wrong) | `lib/cron-auth.ts` vs `api/cron/*/route.ts` | **Still mixed** | PR #7 → all 14 use `verifyCronAuth` |

**Additional P0s found in re-review (not in original PR #5 list):**

| # | Finding | Paths | Fix |
|---|---|---|---|
| 4 | `members_self_update` unrestricted (points inflation risk) | `supabase/migrations/0001_init.sql` | Migration — not in #7 |
| 5 | `redeem_reward` SECURITY DEFINER without `auth.uid() = p_member_id` | `0021_rewards_redemption.sql`, `0025_*.sql` | Migration — not in #7 |

---

## P1 highlights (unchanged / expanded)

- Admin IDORs via `getAdminUser` + service role (`admin/rewards`, `offers`, `community`, members dossier).
- Dual `offers` / `rewards_catalog` (0037 vs 0048).
- Turnstile fail-open; password login skips captcha on main — **PR #6** addresses; align password-Turnstile with FE least-confused guest path.
- Auth callback `next` unsanitized; cookie Decline does not gate `memberengage_ref`.
- Twilio inbound fail-open; SMS API arbitrary destination.
- Caption-image URL regex typo; `/me/card` share uses UUID not slug.

Full detail + **guest journey** findings: [`GUEST_AND_CODE_REVIEW.md`](./GUEST_AND_CODE_REVIEW.md).

---

## Open PRs

| PR | Role |
|---|---|
| [#7](https://github.com/KevinJonasSr/brand-engage-pro/pull/7) | **P0 code fixes** — merge first |
| [#6](https://github.com/KevinJonasSr/brand-engage-pro/pull/6) | Auth/Turnstile/consent/redirect |
| [#5](https://github.com/KevinJonasSr/brand-engage-pro/pull/5) | Prior docs-only review (superseded by this + guest doc) |
| [#3](https://github.com/KevinJonasSr/brand-engage-pro/pull/3) | `/join` optional — live `/join` is 404; use `/signup?ref=nellies` |
| [#4](https://github.com/KevinJonasSr/brand-engage-pro/pull/4) | Prefer close as superseded |

---

## Recommended sequence

1. Merge PR #7 → redeploy → confirm debug route 404 → purge Auth probes.  
2. Merge **guest UX walk PR** (onboarding/check-in/join + Nellie's trust deltas: preview theater, promo codes, RSVP, community authors, rewards fan-copy, footer, events). See Guide mapping in `GUEST_AND_CODE_REVIEW.md`.  
3. Follow-up: redeem shipping language (G6) only — keep FE sign-in unblocked.  
4. PR #6: adopt redirect + Turnstile fail-closed; **do not** take password Turnstile (conflicts with FE / guest UX PR).  
5. RLS / `redeem_reward` migration before marketing points economy.  
6. Soft-launch Nellie's SMS-only; OAuth still gated; one admin; brand-loyalty framing only.
