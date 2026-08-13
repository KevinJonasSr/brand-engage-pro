# Brand Engage Pro — Pre-Launch / Soft-Launch Status Tracker

> Full narrative + guest journey: [`docs/GUEST_AND_CODE_REVIEW.md`](./GUEST_AND_CODE_REVIEW.md).  
> This file is the short P0/P1 status tracker (post soft-launch refresh).

**Date:** 2026-08-13 (post #10)  
**Repo:** `KevinJonasSr/brand-engage-pro` @ `main` (`87ac19b`)  
**Live:** https://brand-engage-pro.vercel.app  
**Supabase:** `enfpviapxvqyoarwwsuf`

### Product framing (binding)

**BEP = brand ↔ loyal customer/member** (restaurants, salons, gyms, etc.). **Not** a music/superfan app — that is **Fan Engage Pro**. Leftover music/fan/artist copy is a **guest-experience bug**. Nellie's must feel like **restaurant loyalty**, not a musician fan club.

---

## Soft-launch CS truth

| Topic | Truth |
|---|---|
| Join | **`/signup?ref=nellies`** — do not market `/join` |
| Stamps | **No `/stamps`** (404) |
| Check-in | **Needs sign-in** |
| Active redeemables | Apron + Recipe **1500**; Hot Sauce **2200** only |
| Music SKUs | Purged (migration **0050**) |
| Probe users | Deleted |
| Guide Brand CS | Flipped to eng truth |

---

## Safe to launch?

**Nellie's single-admin SMS-only soft launch: yes on current posture** (P0 security + guest-walk items shipped).  
**Multi-brand / multi-admin / marketed points economy: not yet** — RLS + `redeem_reward` bind + admin IDOR still open.

Fan Engage launches first — see must-vs-wait table in `GUEST_AND_CODE_REVIEW.md`.

---

## P0 status (shipped)

| # | Finding | Status | Fix |
|---|---|---|---|
| 1 | `/api/debug-supabase` unauthenticated | **Shipped** — prod **404** | [PR #7](https://github.com/KevinJonasSr/brand-engage-pro/pull/7) |
| 2 | Admin broadcast email unscoped | **Shipped** — SMS-only / email disabled unscoped | PR #7 |
| 3 | Cron auth not uniformly fail-closed | **Shipped** — all 14 use `verifyCronAuth` | PR #7 |
| — | Nellie's guest walk (onboarding, check-in, join redirect, marketplace, cookies, CS) | **Shipped** | [PR #9](https://github.com/KevinJonasSr/brand-engage-pro/pull/9) |
| C | Turnstile verify fail-open when secret missing | **Shipped** — production fail-closed | [PR #10](https://github.com/KevinJonasSr/brand-engage-pro/pull/10) |
| D | Auth callback `next` unsanitized | **Shipped** — `safeRelativePath` | PR #10 |
| — | Soft-launch catalog + music purge | **Applied** on `enfpviapxvqyoarwwsuf` | Migrations **0049** / **0050** |

---

## Still open (verified on main — not fixed)

| # | Finding | Paths | Notes |
|---|---|---|---|
| A | `members_self_update` unrestricted (points inflation risk) | `supabase/migrations/0001_init.sql` | No later migration column-restricts updates — **must-before-BEP** points marketing |
| B | `redeem_reward` SECURITY DEFINER without `auth.uid() = p_member_id` | `0021_rewards_redemption.sql`, `0025_*.sql` | Still unbound on main — **must-before-BEP** |

---

## Caution: draft PR #6 — closed without merge

[#6](https://github.com/KevinJonasSr/brand-engage-pro/pull/6) was **closed without merging**. Surgical pieces (`safeRelativePath` + Turnstile fail-closed) landed in [#10](https://github.com/KevinJonasSr/brand-engage-pro/pull/10). Password-Turnstile and Decline-cookie parts conflict with [#9](https://github.com/KevinJonasSr/brand-engage-pro/pull/9) and were not taken.

---

## P1 highlights (still open)

- Admin IDORs via `getAdminUser` + service role (`admin/rewards`, `offers`, `community`, members dossier) — OK single trusted admin only.
- Dual `offers` / `rewards_catalog` (mitigated for soft launch by 0049/0050; structural debt remains).
- Twilio inbound fail-open; SMS API arbitrary destination.
- Caption-image URL regex typo; `/me/card` share uses UUID not slug.

Full detail: [`GUEST_AND_CODE_REVIEW.md`](./GUEST_AND_CODE_REVIEW.md).

---

## Open / related PRs

| PR | Role | Action |
|---|---|---|
| [#7](https://github.com/KevinJonasSr/brand-engage-pro/pull/7) | P0 security | **Merged** |
| [#9](https://github.com/KevinJonasSr/brand-engage-pro/pull/9) | Nellie's guest walk | **Merged** |
| [#10](https://github.com/KevinJonasSr/brand-engage-pro/pull/10) | `safeRelativePath` + Turnstile fail-closed | **Merged** (supersedes safe slice of #6) |
| [#6](https://github.com/KevinJonasSr/brand-engage-pro/pull/6) | Auth/Turnstile/consent | **Closed without merge** — conflicts with #9 |
| [#8](https://github.com/KevinJonasSr/brand-engage-pro/pull/8) | Prior status docs refresh | Merged; this file supersedes Turnstile/redirect claims |
| [#5](https://github.com/KevinJonasSr/brand-engage-pro/pull/5) | Prior docs-only | Superseded |
| [#3](https://github.com/KevinJonasSr/brand-engage-pro/pull/3) / [#4](https://github.com/KevinJonasSr/brand-engage-pro/pull/4) | `/join` / salvage | **Closed** as superseded |

---

## Recommended sequence

1. Keep SMS-only broadcast; never enable unscoped Mailchimp broadcast in prod.  
2. RLS / `redeem_reward` migration before marketing points.  
3. Admin community scope before second brand/admin.  
4. Continue Nellie's soft launch: one admin, brand-loyalty framing only.
