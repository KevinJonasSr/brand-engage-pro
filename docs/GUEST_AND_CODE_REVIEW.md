# Brand Engage Pro — Guest + Code Soft-Launch Status

**Date:** 2026-08-13 (post #10)  
**Repo:** `KevinJonasSr/brand-engage-pro` @ `main` (`87ac19b`)  
**Live:** https://brand-engage-pro.vercel.app  
**Supabase:** `enfpviapxvqyoarwwsuf`  
**Supersedes:** stale claims in earlier drafts of this file / PR #5 that still listed live P0s; Turnstile fail-open + open-redirect claims from the #8 docs refresh  
**Shipped fix PRs:** [#7](https://github.com/KevinJonasSr/brand-engage-pro/pull/7) (security P0s), [#9](https://github.com/KevinJonasSr/brand-engage-pro/pull/9) (Nellie's guest walk), [#10](https://github.com/KevinJonasSr/brand-engage-pro/pull/10) (`safeRelativePath` + Turnstile fail-closed)  
**Closed without merge:** [#6](https://github.com/KevinJonasSr/brand-engage-pro/pull/6) (password-Turnstile / Decline-cookie conflicted with #9; safe slice shipped in #10)

Fan Engage launches **first**. Items below are tagged **must-before-BEP** vs **can-wait-after-FE**.

---

## Product framing (binding)

**Brand Engage Pro** is for **brand ↔ loyal customer/member** relationships — restaurants, salons, gyms, retail, hotels, sports clubs, etc. Members join a brand’s loyalty / member club, check in, earn stamps/points, redeem rewards, and participate in that brand’s community.

**It is not** a music app, superfan app, or artist–fan product. **Fan Engage Pro** is the separate artist–fan product.

| Correct BEP language | Incorrect (treat as guest-experience **bug**) |
|---|---|
| brand, member, loyalty club, visit, check-in, stamp card, reward, special, redeem, server/staff | fan, superfan, artist, drop, presale, livestream, playlist, pre-save, radio request, tour, “inner circle” as music framing |
| Nellie's = **restaurant loyalty** | Nellie's ≠ fan club for musicians |

Fork leftovers from Fan Engage (copy, CTAs, campaign kinds, marketplace music offers) are **product-identity bugs**, not polish. Nellie's soft launch must read as dining loyalty end-to-end.

---

## Verdict: Nellie's soft-launch status

**Security + guest-walk P0s from the original review are shipped on `main` and live.** Soft launch for a **single trusted admin + SMS-only** Nellie's **restaurant loyalty** club is the current ops posture.

| Gate | Status on `main` @ `87ac19b` / live |
|---|---|
| Unauthenticated `/api/debug-supabase` | **Shipped** — route removed in PR #7; prod **404** |
| Admin email broadcast unscoped | **Shipped** — UI SMS-only; server rejects email/`both` unless `MAILCHIMP_BROADCAST_ENABLED=1` (PR #7) |
| Cron auth fail-closed | **Shipped** — all 14 crons use `verifyCronAuth` (PR #7) |
| Guest path = restaurant loyalty (not music fan club) | **Shipped for Nellie's walk** — PR #9 + migrations 0049/0050 (music SKUs purged; apron+hot sauce active) |
| Probe Auth pollution | **Cleared** — `bep-probe+*@example-debug.invalid` Auth users deleted on `enfpviapxvqyoarwwsuf` |
| Guide Brand CS | **Flipped** — support scripts match eng truth below |
| Multi-brand / multi-admin | **Still not safe** (admin IDOR P1s remain) |
| Points integrity (RLS / redeem bind) | **Still open** — see remaining P1s (verified on main) |

Do **not** open multi-brand admin access until community-scoped admin actions land.

---

## Soft-launch CS truth (Guide / support)

Use these scripts — do **not** invent routes or stock.

1. **Join path** — **`/signup?ref=nellies`**. Do **not** send guests to `/join` as the branded path (live `/join` may 307 → signup after PR #9; CS still quotes signup+ref only).
2. **No `/stamps`** — route **404**. Check-ins + brand rewards are the loyalty path; do not promise a stamp-card page.
3. **Check-in needs sign-in** — logged-out guests see a sign-in gate (no fake “Checking you in…” theater). Brand display name = **Nellie's Southern Kitchen**.
4. **Soft-launch redeemables only** — **Nellie's Apron + Recipe Card (1,500)** and **House Hot Sauce 3-Pack (2,200)**. Do not market empty Gold/Platinum redeemables.
5. **Music SKUs purged** — marketplace/catalog music leftovers deactivated via migration **0050** on `enfpviapxvqyoarwwsuf`.
6. **Forgot password** — use **Forgot password?** on `/login`.
7. **Magic link vs password** — magic link only needs email; empty password must not block OTP.
8. **Preview theater** — logged-out sample numbers are not a real balance; new accounts start at 0.

---

## A) Code review — shipped P0s

### P0-1. `/api/debug-supabase` — **SHIPPED (PR #7)**
| | |
|---|---|
| **Was** | Unauthenticated route leaked key prefixes and created Auth probe users |
| **Fix** | Route deleted in PR #7 |
| **Live verify** | `GET /api/debug-supabase` → **404** |
| **Ops** | Probe Auth users purged on `enfpviapxvqyoarwwsuf` |

### P0-2. Admin broadcast email unscoped — **SHIPPED (PR #7)**
| | |
|---|---|
| **Was** | Email path blasted full Mailchimp audience; tier IDs unused |
| **Fix** | UI SMS-only; server rejects `email`/`both`; `broadcastEmail` errors unless `MAILCHIMP_BROADCAST_ENABLED=1` |
| **Residual** | SMS tier filter still label-only (does not narrow Twilio recipients) — P1 ops risk, not whole-audience blast |
| **Ops** | Never set `MAILCHIMP_BROADCAST_ENABLED=1` in prod until segments exist |

### P0-3. Cron auth fail-closed — **SHIPPED (PR #7)**
| | |
|---|---|
| **Was** | 8/14 crons fail-open if `CRON_SECRET` unset |
| **Fix** | All 14 cron routes call `verifyCronAuth` |
| **Verify on main** | Every `frontend/app/api/cron/*/route.ts` imports the helper |

### P0-4 / guest walk — **SHIPPED (PR #9 + migrations)**
| | |
|---|---|
| **Was** | Onboarding flash, check-in theater, `/join` 404, marketplace music SKUs, preview theater, cookie Decline gaps, etc. |
| **Fix** | PR #9 guest UX; migrations **0049** (apron 1500 + hot sauce 2200 only) and **0050** (purge music SKUs) applied on `enfpviapxvqyoarwwsuf` |

---

## Caution: draft PR #6 — closed without merge

[#6](https://github.com/KevinJonasSr/brand-engage-pro/pull/6) (`cursor/auth-security-soft-launch-e8a8`) was **closed without merging**. It conflicted with soft-launch truth already on main via PR #9:

| PR #6 change | Soft-launch conflict |
|---|---|
| Requires Turnstile on **password** login | Main (PR #9) intentionally **skips** password Turnstile to match FE least-confused path |
| Cookie Decline / referral gating | Partially superseded by PR #9 `cookie-consent` + Accept-only referral cookie |

**Shipped in [#10](https://github.com/KevinJonasSr/brand-engage-pro/pull/10)** (surgical slice only):

1. `safeRelativePath` / auth-callback open-redirect fix  
2. Turnstile verify **fail-closed** when secret missing in production  

…and **did not** reintroduce password Turnstile or undo Accept-only cookie behavior.

---

## Remaining open findings (verified on `main` @ `87ac19b`)

These were called out in the original review and are **still true** in the repo (no later migration/PR closed them). Treat as **must-before-BEP** for a marketed points economy / public multi-tenant launch; acceptable caveats for single-admin Nellie's soft launch only where noted.

### Still-open integrity gaps (former P0s → now launch blockers before points marketing)

#### RLS: `members_self_update` unrestricted
| | |
|---|---|
| **Path** | `supabase/migrations/0001_init.sql` — `members_self_update` is `for update using (auth.uid() = id)` with **no column restriction** |
| **Related** | `purchases_self_insert`; `memberships_own_update` in `0011_multi_tenant.sql` |
| **Verify** | No later migration replaces this policy with column-limited updates |
| **Why** | Authenticated member can inflate `total_points` via anon client if PostgREST exposes those columns |
| **Timing** | **must-before-BEP** for points integrity — needs migration |

#### `redeem_reward` does not bind caller to `p_member_id`
| | |
|---|---|
| **Paths** | `supabase/migrations/0021_rewards_redemption.sql` (SECURITY DEFINER); grants in `0025_*`; client `frontend/lib/data/rewards.ts` passes `p_member_id` |
| **Verify** | Function body has **no** `auth.uid() = p_member_id` check; no later migration adds it |
| **Timing** | **must-before-BEP** — needs migration |

### P1 — high priority (soft-launch caveats / pre-BEP)

#### P1-1. Cross-tenant admin IDORs (`getAdminUser` + service role)
| Action | Path | Gap |
|---|---|---|
| Reward update/toggle | `frontend/app/admin/rewards/actions.ts` | By `rewardId` only — no `community_id` |
| Fulfill/cancel | same | No community check; cancel trusts client `memberId` + `pointCost` |
| Create/toggle offer | `frontend/app/admin/offers/actions.ts` | Insert omits `community_id`; list unscoped |
| Community mod / suspend | `frontend/app/admin/community/actions.ts` | Any admin → any post/member ID |
| Member dossier | `frontend/app/admin/members/[id]/page.tsx` | `select("*")` by id — cross-brand PII |

**Timing:** OK for **single trusted super-admin** Nellie's soft launch. **Must-before-BEP** multi-admin / second brand.

#### P1-2. Dual catalogs: `offers` vs `rewards_catalog`
Soft-launch mitigations (0049/0050) deactivate music SKUs and limit Nellie's active redeemables, but two catalogs remain. Marketplace vs rewards-tab confusion can return if operators re-seed or reactivate wrong rows.  
**Timing:** Rewards-tab-only Nellie's = **can-wait**. Marketing marketplace as live redeem = **must-before**.

#### P1-3. Turnstile fail-open + auth callback open redirect — **SHIPPED (PR #10)**
Surgical slice from #6: `safeRelativePath` on auth callback / login / signup `next`, and production Turnstile fail-closed when keys are missing. Password login remains captcha-free; cookie banner remains Accept-only.

#### P1-4. Twilio inbound signature fail-open + full-table phone scan
| Path | `frontend/app/api/twilio/inbound/route.ts` |
|---|---|
| **Gap** | Signature checked only if `TWILIO_AUTH_TOKEN` set; loads all members’ phones to match |
| **Timing** | **must-before-BEP** if SMS live |

#### P1-5. SMS API can message arbitrary E.164
| Path | `frontend/app/api/member-engage/sms/route.ts` |
|---|---|
| **Gap** | Authenticated caller can target any phone (cost / abuse) |
| **Timing** | **must-before-BEP** if Twilio live |

#### P1-6. AI caption URL regex rejects valid `https://`
| Path | `frontend/app/api/ai/caption-image/route.ts` — `/^https?\/\//i` (missing `:`) |
|---|---|
| **Timing** | **can-wait** |

#### P1-7. Member card share uses UUID not `profile_slug`
| Path | `frontend/app/me/card/page.tsx` → `/members/${member.id}` |
|---|---|
| **Timing** | **can-wait** for soft launch |

---

### P2 — track, not launch-blocking for single-brand soft launch

- CI: gitleaks only (`.github/workflows/secret-scan.yml`); no build/tsc gate.
- Docs drift: README URLs TBD; COLLABORATING may point at old Vercel host / wrong migrations path.
- Inherited naming: `memberengage_*` cookies, `fe_admin_community`, reply-to leftovers.
- In-memory rate limits weaken on multi-instance Vercel.
- Open PR #4 salvage bundles largely already on main — **closed** as superseded.
- Open PR #3 `/join` — **closed**; superseded by PR #9 redirect; CS still uses `/signup?ref=nellies`.

---

### Env / migrations (verify, don’t invent)

**Core:** `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, Stripe, Twilio, Anthropic/OpenAI, Mailchimp.

**Used but under-documented:** Turnstile pair, `MAILCHIMP_TRANSACTIONAL_API_KEY`, `ADMIN_EMAILS`, `ADMIN_BASIC_*`, `STRIPE_SEED_SECRET`, VAPID keys, Network hub keys, `NEXT_PUBLIC_SITE_URL`. Never set `MAILCHIMP_BROADCAST_ENABLED=1` in prod until segments exist.

**Migrations in repo** include **0049** / **0050** (soft-launch redeemables + music SKU purge) — **applied** on `enfpviapxvqyoarwwsuf`. Still verify profile columns when needed:

```sql
select count(*) filter (where handle is null), count(*) from public.members;
select count(*) filter (where profile_slug is null), count(*) from public.members;
```

---

## B) Guest experience (Nellie's) — post PR #9

**Acceptance bar:** A guest who never saw Fan Engage should experience Nellie's as a **restaurant loyalty club**.

### Soft-launch CS routes (live)

| Route | Live | CS message |
|---|---|---|
| `/signup?ref=nellies` | **200** | Canonical join link |
| `/join` | **307 → /signup** (query preserved) | Do **not** print/QR `/join`; quote signup+ref |
| `/stamps` | **404** | Do not promise |
| Check-in | Sign-in required | Sign in, then reopen the same check-in link |

### Guest bugs — status after PR #9

| # | Issue | Status |
|---|---|---|
| G1 | Brand CTA “Shop drops” | **Fixed** in PR #9 → rewards / check-in |
| G2 | Marketplace music / artist drops | **Mitigated** — 0050 purge + brand-scope filter |
| G3 | Global `/rewards` artist–fan copy | **Fixed** in PR #9 (restaurant loyalty copy) |
| G4 | Home “Complete profile” → `/signup` | **Fixed** → onboarding path |
| G5 | Check-in slug / theater | **Fixed** — display name + sign-in gate |
| G6 | Redeem shipping language | **Addressed** in PR #9 (pickup / show-to-server) — re-spot-check if copy drifts |
| G7 | Hardcoded merch strip | **Mitigated** with soft-launch stock truth |
| G8 | Landing / empty “shows/drops” | **Largely fixed** on Nellie's path — watch for residual FE copy on unused surfaces |
| G9 | Cookie Decline cosmetic | **Fixed** in PR #9 (Accept-only non-essential) |
| G10–G12 | Campaign DSP kinds / share DROP / static artist brands | **Residual risk** if those surfaces are published — hide/rewrite before enabling |

### What works for Nellie's (restaurant-correct)

- Guest brand CTA → `/signup?ref=nellies`
- Live brand page bio, specials, events read as a restaurant
- Soft-launch catalog: apron 1,500 + hot sauce 2,200 only
- Music SKUs deactivated
- Cookie banner + Accept-gated referral cookie
- Forgot / reset password paths on login

---

## Top remaining work (ordered)

1. **RLS + `redeem_reward` auth.uid bind** migration before any points-economy marketing.  
2. **Twilio inbound fail-closed** + bind SMS send to own phone (if SMS marketed).  
3. **Admin community scoping** before second brand/admin.  
4. Residual music CTA kinds / share surfaces (G10–G12) before those features go live.  
5. Dual-catalog cleanup if marketplace is marketed as redeem.

---

## Must-before-BEP vs can-wait-after-FE

| Item | When |
|---|---|
| Debug route, email blast, cron fail-close | **Shipped** — PR #7 |
| Nellie's guest walk + 0049/0050 + probe purge + Guide CS | **Shipped** — PR #9 + ops |
| Turnstile fail-closed + open redirect | **Shipped** — PR #10 (not full #6) |
| RLS points / redeem_reward caller check | **must-before-BEP** (still open on main) |
| Twilio signature fail-closed + SMS abuse | **must-before-BEP** if SMS marketed |
| Admin IDOR community scope | can-wait single admin; **must** before multi-admin |
| Dual catalog cleanup | **must** if marketplace shown as redeem |
| Caption regex, share UUID slug, cookie key rename | can-wait |
| Docs/README/HANDOFF drift, CI typecheck | can-wait |

---

## Recommended sequence (from here)

1. Keep soft-launch ops: **SMS-only** broadcast; do not set `MAILCHIMP_BROADCAST_ENABLED`.  
2. Ship RLS / `redeem_reward` migration before marketing points.  
3. Confirm env + migration SQL stay healthy on `enfpviapxvqyoarwwsuf`.  
4. Soft-launch continue: magic-link + password, OAuth gated, one admin — **brand loyalty framing only**.

---

## Method

- Re-verified on `main` @ `87ac19b` + live HTTP probes (debug **404**, `/signup?ref=nellies` **200**, `/join` **307**, `/stamps` **404**). Auth redirect + Turnstile fail-closed shipped in PR #10 (`b7a7e61`).  
- Confirmed remaining RLS / `redeem_reward` gaps by reading migrations (no later bind/column restrict).  
- No invented metrics. Ops claims for applied 0049/0050, probe purge, and Guide CS flip recorded as soft-launch truth from launch ops.  
- Original pre-launch P0 list updated to **shipped** with PR refs; open work called out separately.
