# Brand Engage Pro — Pre-Launch / Soft-Launch Status Tracker

> Full narrative + guest journey: [`docs/GUEST_AND_CODE_REVIEW.md`](./GUEST_AND_CODE_REVIEW.md).  
> This file is the short P0/P1 status tracker (post soft-launch refresh).

**Date:** 2026-08-13 (points-integrity + #10 auth follow-up)  
**Repo:** `KevinJonasSr/brand-engage-pro` @ `main` (`c232393`)  
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
| Active perks | Jackie: dessert on join; 1,500 pts after 3 check-ins; birthday entrée in birthday month. Bourbon & Cigar Night **Sept 23, 2026 7:00pm ET**, Private Dining Room, cap 40. Apron/hot sauce **hidden**. |
| Music SKUs | Purged (migration **0050**) |
| Probe users | Deleted |
| Guide Brand CS | Flipped to eng truth |

---

## Safe to launch?

**Nellie's single-admin SMS-only soft launch: yes on current posture** (P0 security + guest-walk + #10 auth items shipped).  
**Multi-brand / multi-admin: not yet** — admin IDOR still open. **Marketed points economy:** apply migration **0051** on live first.

Fan Engage launches first — see must-vs-wait table in `GUEST_AND_CODE_REVIEW.md`.

---

## P0 status (shipped)

| # | Finding | Status | Fix |
|---|---|---|---|
| 1 | `/api/debug-supabase` unauthenticated | **Shipped** — prod **404** | [PR #7](https://github.com/KevinJonasSr/brand-engage-pro/pull/7) |
| 2 | Admin broadcast email unscoped | **Shipped** — SMS-only / email disabled unscoped | PR #7 |
| 3 | Cron auth not uniformly fail-closed | **Shipped** — all 14 use `verifyCronAuth` | PR #7 |
| — | Nellie's guest walk (onboarding, check-in, join redirect, marketplace, cookies, CS) | **Shipped** | [PR #9](https://github.com/KevinJonasSr/brand-engage-pro/pull/9) |
| — | Soft-launch catalog + music purge | **Applied** on `enfpviapxvqyoarwwsuf` | Migrations **0049** / **0050** |
| C | Turnstile verify fail-open when secret missing | **Shipped** — production fail-closed | [PR #10](https://github.com/KevinJonasSr/brand-engage-pro/pull/10) |
| D | Auth callback `next` unsanitized | **Shipped** — `safeRelativePath` | PR #10 |
| A | `members_self_update` unrestricted | **Shipped in repo** (apply **0051** on live DB) | Migration **0051** column GRANT + trigger |
| B | `redeem_reward` unbound `p_member_id` | **Shipped in repo** (apply **0051** on live DB) | Migration **0051** + session-bound `redeemReward()` |

---

## Still open (verified on main)

| # | Finding | Paths | Notes |
|---|---|---|---|
| — | Admin IDORs / Twilio / dual catalog | see P1 below | Not in the 0051 points-integrity PR |

A–D from the prior tracker: **A/B** closed by **0051**; **C/D** closed by [PR #10](https://github.com/KevinJonasSr/brand-engage-pro/pull/10). [#6](https://github.com/KevinJonasSr/brand-engage-pro/pull/6) was closed without merge.

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
| [#8](https://github.com/KevinJonasSr/brand-engage-pro/pull/8) | Prior status docs refresh | Merged; Turnstile/redirect claims superseded by #10/#11 |
| [#5](https://github.com/KevinJonasSr/brand-engage-pro/pull/5) | Prior docs-only | Superseded |
| [#3](https://github.com/KevinJonasSr/brand-engage-pro/pull/3) / [#4](https://github.com/KevinJonasSr/brand-engage-pro/pull/4) | `/join` / salvage | **Closed** as superseded |

---

## Recommended sequence

1. Keep SMS-only broadcast; never enable unscoped Mailchimp broadcast in prod.  
2. Apply migration **0051** on live before marketing points.  
3. Admin community scope before second brand/admin.  
4. Continue Nellie's soft launch: one admin, brand-loyalty framing only.
