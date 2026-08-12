# Brand Engage Pro — Guest + Code Pre-Launch Review

**Date:** 2026-08-12  
**Repo:** `KevinJonasSr/brand-engage-pro` @ `main` (`e24b443`)  
**Live:** https://brand-engage-pro.vercel.app  
**Supabase (from live `/api/debug-supabase` before removal):** `enfpviapxvqyoarwwsuf`  
**Supersedes:** PR #5 `docs/PRE_LAUNCH_REVIEW.md` (code P0s re-verified; adds guest journey)  
**Companion fix PR:** [#7](https://github.com/KevinJonasSr/brand-engage-pro/pull/7) — debug route, email broadcast kill-switch, cron fail-close  
**Related open PRs:** [#6](https://github.com/KevinJonasSr/brand-engage-pro/pull/6) auth/Turnstile/cookies; [#3](https://github.com/KevinJonasSr/brand-engage-pro/pull/3) `/join` (optional); [#5](https://github.com/KevinJonasSr/brand-engage-pro/pull/5) prior docs-only review  

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

## Verdict: safe for Nellie's soft launch?

**Not on current `main` as deployed.** Merge **PR #7** (and purge probe Auth users), then soft-launch is plausible for a **single trusted admin + SMS-only** Nellie's **restaurant loyalty** club **if** you also clear guest music/fan copy bugs on the member path and accept remaining P1s (RLS, Turnstile until #6).

| Gate | Status on `main` @ e24b443 | After PR #7 |
|---|---|---|
| Unauthenticated `/api/debug-supabase` | **Live 200** — creates Auth users | Removed |
| Admin email broadcast unscoped | **Broken** (full Mailchimp audience) | Disabled (SMS-only) |
| Cron auth fail-closed | **8/14 fail-open** if secret unset | All 14 via `verifyCronAuth` |
| Guest path = restaurant loyalty (not music fan club) | **Fail** — drops/presales/artist leftovers | Unchanged until guest copy PR |
| Multi-brand / multi-admin | **Not safe** | Still not safe |

Do **not** open multi-brand admin access until community-scoped admin actions land.

---

## A) Code review

### P0 — must fix before BEP go-live

#### P0-1. `/api/debug-supabase` live, unauthenticated, mutates Auth
| | |
|---|---|
| **Path** | `frontend/app/api/debug-supabase/route.ts` |
| **Live verify** | `GET https://brand-engage-pro.vercel.app/api/debug-supabase` → **200**; returns `urlPrefix`, anon/service key prefixes + lengths; `signupProbe.userCreated: true` |
| **Fix** | PR #7 deletes the route |
| **Ops** | Purge `bep-probe+*@example-debug.invalid` from Auth on `enfpviapxvqyoarwwsuf` |
| **Timing** | **must-before-BEP** (BEP-specific) |

#### P0-2. Admin broadcast email ignores brand/tier
| | |
|---|---|
| **Paths** | `frontend/app/admin/broadcast/actions.ts`, `frontend/lib/broadcast.ts`, also `frontend/app/admin/campaigns/actions.ts` |
| **Evidence** | SMS passes `brandSlug`. Email calls `broadcastEmail({ subject, body })` with no brand filter; Mailchimp uses full `MAILCHIMP_AUDIENCE_ID`. `allowedMemberIds` computed then **unused**. |
| **Fix** | PR #7: UI SMS-only; server rejects `email`/`both`; `broadcastEmail` errors unless `MAILCHIMP_BROADCAST_ENABLED=1` |
| **Residual** | SMS tier filter still label-only (does not narrow Twilio recipients) — P1 ops risk, not whole-audience blast |
| **Timing** | **must-before-BEP** if email UI reachable; after #7 SMS soft launch OK |

#### P0-3. Cron auth not uniformly fail-closed
| | |
|---|---|
| **Helper** | `frontend/lib/cron-auth.ts` — correct fail-closed |
| **On main** | Only 6/14 used helper; 8 fail-open when `CRON_SECRET` unset; `anniversary-celebrate` also accepted `?secret=` |
| **Live** | Unauth cron probes → **401** (secret appears set today); footgun remains on misconfigured redeploy |
| **HANDOFF** | Claims all crons use `verifyCronAuth` — **false** on main |
| **Fix** | PR #7 routes all 14 through helper |
| **Timing** | **must-before-BEP** (inherited FE pattern) |

#### P0-4. RLS: members can self-update unrestricted columns (incl. points)
| | |
|---|---|
| **Path** | `supabase/migrations/0001_init.sql` — `members_self_update` is `for update using (auth.uid() = id)` with **no column restriction** |
| **Related** | `purchases_self_insert` (member can insert purchase rows); `memberships_own_update` in `0011_multi_tenant.sql` |
| **Why** | Authenticated member can inflate `total_points` via anon client if PostgREST allows those columns |
| **Timing** | **must-before-BEP** for points integrity (inherited). Migration required — not in PR #7 |

#### P0-5. `redeem_reward` does not bind caller to `p_member_id`
| | |
|---|---|
| **Paths** | `supabase/migrations/0021_rewards_redemption.sql` (SECURITY DEFINER); `0025_grant_anon_authenticated_defaults.sql` grants execute on public functions to `anon, authenticated`; client `frontend/lib/data/rewards.ts` passes `p_member_id` |
| **Evidence** | Function body has no `auth.uid() = p_member_id` check |
| **Timing** | **must-before-BEP** (inherited). Needs migration — not in PR #7 |

---

### P1 — high priority (soft-launch caveats)

#### P1-1. Cross-tenant admin IDORs (`getAdminUser` + service role)
| Action | Path | Gap |
|---|---|---|
| Reward update/toggle | `frontend/app/admin/rewards/actions.ts` | By `rewardId` only — no `community_id` |
| Fulfill/cancel | same | No community check; cancel trusts client `memberId` + `pointCost` |
| Create/toggle offer | `frontend/app/admin/offers/actions.ts` | Insert omits `community_id`; list unscoped |
| Community mod / suspend | `frontend/app/admin/community/actions.ts` | Any admin → any post/member ID |
| Member dossier | `frontend/app/admin/members/[id]/page.tsx` | `select("*")` by id — cross-brand PII |

**Timing:** Can wait for **single trusted super-admin** Nellie's soft launch. **Must-before-BEP** multi-admin / second brand.

#### P1-2. Dual catalogs: `offers` vs `rewards_catalog`
| Surface | Table |
|---|---|
| `/brands/[slug]/rewards` redeem | `rewards_catalog` + `redeem_reward` RPC |
| `/admin/rewards`, redemptions | `rewards_catalog` |
| `/admin/offers`, `/marketplace` | `offers` |
| `0037_nsk_jge_rewards.sql` | seeds **`offers` only** (includes JGE music items) |
| `0048_nsk_full_program.sql` | seeds **both** for Nellie's |

Marketplace “Redeem” is non-actionable for guests in places; operators can edit the wrong catalog.  
**Timing:** Rewards-tab-only Nellie's launch = **can-wait**. Marketing marketplace as live redeem = **must-before**.

#### P1-3. Turnstile / auth (main vs PR #6)
**On main today:**
- `frontend/app/api/turnstile/verify/route.ts` — missing secret → `{ success: true }` (fail-open)
- Client missing site key → success
- `frontend/app/login/page.tsx` — password path **skips** Turnstile; magic-link only verifies
- `frontend/app/auth/callback/route.ts` — `next` unsanitized (open redirect); login/signup allowlist relative paths only
- Cookie banner Decline is cosmetic; `invite/[code]/set-ref-cookie.tsx` always sets `memberengage_ref`

**PR #6 (open draft)** fail-closes Turnstile in production, adds password Turnstile, sanitizes callback redirects, gates referral cookie on Accept.

**FE password-skip note:** Fan Engage may intentionally skip Turnstile on password login (password already proves possession; magic-link is the bot vector). BEP PR #6 **requires** password Turnstile. For guest clarity across the two products, **prefer aligning with FE’s least-confused path** (same widget placement / same skip-or-require rule) so operators and members are not trained on divergent auth UX. If BEP keeps password Turnstile, say so in ops runbooks; do not silently diverge.

**Timing:** **must-before-BEP** open public signup. Merge #6 or equivalent; decide password Turnstile parity with FE explicitly.

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
| **Timing** | **can-wait** (feature broken, not security-critical) |

#### P1-7. Member card share uses UUID not `profile_slug`
| Path | `frontend/app/me/card/page.tsx` → `/members/${member.id}` |
|---|---|
| **Timing** | **can-wait** for soft launch; fix before pushing share cards hard |

---

### P2 — track, not launch-blocking for single-brand soft launch

- CI: gitleaks only (`.github/workflows/secret-scan.yml`); no build/tsc gate. `package.json` has no `typecheck` script though docs mention it.
- Orphan `brand_events` / embeddings noise — re-run `AI_LAUNCH_CHECKLIST.md` SQL on live project.
- Docs drift: README URLs TBD; COLLABORATING points at `brand-engage-pro-jonas-group.vercel.app` and `frontend/supabase/migrations/`; HANDOFF cron count wrong.
- Inherited naming: `memberengage_*` cookies, `fe_admin_community`, reply-to `memberengage.app`.
- In-memory rate limits weaken on multi-instance Vercel.
- Open PR #4 salvage bundles largely already on main — prefer close as superseded.
- Open PR #3 `/join` — live `/join` is **404**; not required for Nellie's (`/signup?ref=nellies` works).

---

### Env / migrations (verify, don’t invent)

**Core (HANDOFF):** `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, Stripe, Twilio, Anthropic/OpenAI, Mailchimp.

**Used but under-documented:** Turnstile pair, `MAILCHIMP_TRANSACTIONAL_API_KEY`, `ADMIN_EMAILS`, `ADMIN_BASIC_*`, `STRIPE_SEED_SECRET`, VAPID keys, Network hub keys, `NEXT_PUBLIC_SITE_URL`. After PR #7: never set `MAILCHIMP_BROADCAST_ENABLED=1` in prod until segments exist.

**Migrations in repo** (`supabase/migrations/`, 48 files): 0032/0033 profile; 0035 checkins; 0036 stamps; 0037 offers seed; 0048 full NSK program. Checklist still marks 0032/0033 unchecked — **verify with SQL**, don’t trust docs:

```sql
select count(*) filter (where handle is null), count(*) from public.members;
select count(*) filter (where profile_slug is null), count(*) from public.members;
```

---

## B) Guest experience (Nellie's first)

Journey audited: **join → signup/login → brand home → check-in/stamp → rewards redeem → community**.

Live probes: `/` 200, `/brands/nellies` 200, `/marketplace` 200, `/rewards` 200, `/join` **404**, `/brands/nellies/rewards` redirects guests to login.

**Acceptance bar:** A guest who never saw Fan Engage should experience Nellie's as a **restaurant loyalty club**. Any music/fan/artist framing on that path is a **bug**.

### Guest bugs — must-fix before Nellie's soft launch

Music/fan/artist leftovers are called out explicitly as product-identity bugs (not “copy polish”).

| # | Bug type | Issue | Path(s) | Evidence |
|---|---|---|---|---|
| G1 | **Music leftover** | Signed-in brand primary CTA is **“Shop drops”** → `/marketplace` | `frontend/app/brands/[slug]/page.tsx` | “Drops” is FE vocabulary; should be brand rewards / check-in for restaurant members |
| G2 | **Music leftover** | Marketplace mixes NSK dining perks with JGE **artist** “drops” under merch framing | `frontend/app/marketplace/page.tsx`, seed `0037_nsk_jge_rewards.sql` | Live: “Sign up to redeem these drops”; “Exclusive Content Drop”, “VIP Suite Experience” next to Complimentary Dessert — makes Nellie's feel like a music marketplace |
| G3 | **Music leftover** | Global nav **Rewards** (`/rewards`) is artist–fan copy | `frontend/app/rewards/page.tsx` | Live: “presales”, “livestream Q&A”, “Redeem points for drops”, dead `#` CTAs — wrong product |
| G4 | Flow bug | Home “Complete profile” → `/signup` (wrong); Invite → `/onboarding` | `frontend/app/page.tsx` | Brand page correctly uses `/onboarding?ref=…` |
| G5 | Loyalty UX bug | Check-in copy uses raw slug (“nellies”); stamp “Scan check-in QR” auto-POSTs check-in (no scanner) | `frontend/app/brands/[slug]/checkin/page.tsx`, `frontend/components/stamp-card.tsx` | Breaks restaurant visit/check-in story |
| G6 | Loyalty UX bug | Redeem modal = merch shipping/delivery language | `frontend/app/brands/[slug]/rewards/redeem-form.tsx` | “shirt size, shipping address”, “will be in touch about delivery” — wrong for dessert/appetizer; should be show-to-server / tonight |
| G7 | Loyalty UX bug | Brand home “Member club rewards” hardcoded merch, not linked to redeem catalog | `frontend/lib/brands.ts` (`nellies.merch`), brand page | Live: apron / hot sauce cards non-actionable vs real rewards catalog |
| G8 | **Music leftover** | Landing / signup / empty states still FE drops / merch / **shows** | `signed-out-landing.tsx`, `signup-client.tsx`, `brands/page.tsx`, `member-home-dashboard.tsx`, `page.tsx`, `push-opt-in-prompt.tsx` | Live: “exclusive drops”; empty: “No upcoming shows…” — fan-club framing, not brand loyalty |
| G9 | Mobile/consent | Sign in hidden (`sm:inline-flex`); cookie banner can cover CTAs | `frontend/app/layout.tsx`, `cookie-banner.tsx`, `mobile-nav.tsx` | Decline/Accept functionally identical on main |
| G10 | **Music leftover** | Campaign member CTAs are DSP/artist actions | `admin/campaigns/new/builder.tsx`, `brands/[slug]/community/member-cta-block.tsx` | `pre_save`, `radio_request`, `playlist_add` — if any Nellie's campaign publishes these, members see a music product |
| G11 | **Music leftover** | Share / notifications / referrals / premium still artist–fan | `share/drop/...`, `me/notifications/preferences-form.tsx` (“Drops & releases”), `referrals/page.tsx`, `premium/page.tsx` | “Exclusive Drop”, VIP livestream, early ticket access — bugs if guests hit these surfaces |
| G12 | **Music leftover** | LatestStrip kind label `"DROP"`; fallback artist brands in static map | `components/latest-strip.tsx`, `lib/brands.ts` (`raelynn`, etc.) | Reinforces wrong product if shown; DB currently filters to active brands |

### Guest can-wait (not on Nellie's critical path / non-visible)

- Cookie storage key still `memberengage_*` (not guest-visible)
- `/join` 404 until redirect or PR #3 — **must not** put `/join` on Nellie's print/QR; use `/signup?ref=nellies`
- Internal naming (`fe_admin_community`) — ops only

Do **not** treat G10–G12 as harmless polish if those surfaces are reachable during soft launch — hide, rewrite, or block them.

### What already works for Nellie's (restaurant-correct)

- Guest brand CTA: **“Join the member club”** → `/signup?ref=nellies` (loyalty framing OK)
- Live brand page bio, specials, upcoming events (karaoke/brunch) read as a restaurant
- Community empty state (“Nothing posted yet”) is fine
- Seed program in `0048_nsk_full_program.sql` is substantial (offers/badges/events/challenges)
- Cookie banner present on signup/login/onboarding routes

---

## Top fixes ordered by **guest impact**

1. **Merge PR #7** — stop live debug Auth pollution + accidental whole-list email (ops trust).  
2. **Purge probe Auth users** on Supabase.  
3. **Product-identity / loyalty copy pass** (blocks “feels like a music fan club”):  
   - Kill “drops / presales / livestream / shows / Shop drops” on Nellie's path (G1, G3, G8)  
   - Hide or brand-filter marketplace; remove JGE artist offers from guest view (G2)  
   - Redeem = show-to-server, not shipping (G6); check-in uses brand name (G5)  
   - Home complete-profile → `/onboarding` (G4); wire or remove hardcoded merch strip (G7)  
   - Replace campaign CTA kinds + share/referral/premium music copy before those surfaces go live (G10–G12)  
4. **Merge PR #6** (or FE-aligned variant) before open signup — redirects, consent, Turnstile fail-closed; decide password Turnstile parity with FE (auth UX only — products stay separate).  
5. **RLS + `redeem_reward` auth.uid bind** migration before any points economy marketing.  
6. **Twilio inbound fail-closed** + bind SMS send to own phone.  
7. **Admin community scoping** before second brand/admin.  
8. Mobile Sign in affordance + cookie banner not covering primary CTAs (G9).

---

## Must-before-BEP vs can-wait-after-FE

| Item | When |
|---|---|
| Debug route, email blast, cron fail-close | **must-before-BEP** → PR #7 |
| RLS points / redeem_reward caller check | **must-before-BEP** (shared FE risk — if FE ships first without this, BEP must still fix before BEP go-live) |
| Turnstile fail-closed + open redirect + consent | **must-before-BEP** public auth → PR #6 / FE align |
| Twilio signature fail-closed + SMS abuse | **must-before-BEP** if SMS marketed |
| Music/fan/artist leftover copy on guest path (G1–G3, G8, G10–G12) | **must-before-BEP** — product-identity bugs, not polish |
| Restaurant loyalty UX (check-in labels, redeem-to-server, profile link) | **must-before-BEP** Nellie's soft launch |
| Admin IDOR community scope | can-wait single admin; **must** before multi-admin |
| Dual catalog cleanup | **must** if marketplace shown; can-wait only if marketplace hidden and rewards tab only |
| Caption regex, share UUID slug, `/join` route, cookie key rename | can-wait if surfaces unused |
| Docs/README/HANDOFF drift, CI typecheck | can-wait |

---

## Recommended sequence

1. Merge **PR #7**; redeploy; confirm `/api/debug-supabase` → 404; purge probe users.  
2. Soft-launch ops rule: **SMS-only** broadcast; do not set `MAILCHIMP_BROADCAST_ENABLED`.  
3. Merge **guest UX walk PR** (below) — onboarding gate, check-in signed-out, `/join` redirect, marketplace brand-scope, Accept-only cookies, password Turnstile skip.  
4. Follow-up only: redeem shipping language (G6). Trust deltas (preview theater, codes, RSVP, community, rewards fan-copy) are in the guest UX PR.  
5. PR #6: take redirect/Turnstile fail-closed pieces **without** password Turnstile (conflicts with FE least-confused path — guest UX PR keeps password skip).  
6. Ship RLS / `redeem_reward` migration (coordinate with FE if shared patterns).  
7. Confirm env + migration SQL on `enfpviapxvqyoarwwsuf`.  
8. Soft-launch Nellie's: magic-link + password, OAuth still gated, one admin — **brand loyalty framing only**.

---

## Guide’s Nellie's / BEP guest walk → fixes

Product: **BEP = brand ↔ loyal member restaurant loyalty — not music/superfan.**

| Guide walk / Nellie's delta | Severity | Fix PR / status |
|---|---|---|
| Anonymous `/onboarding` wizard flash | P0 | Guest UX PR: server gate + `authReady`; CTA → `/signup?next=/onboarding` |
| Check-in stuck spinning when logged out | P0 | Guest UX PR: auth-first → Sign in CTA |
| `/join` → 404 | P0 | Guest UX PR: → `/signup` (query preserved) |
| Preview theater (8500 / 11420 / Gold / fake badges) | P0 trust | Guest UX PR: honest 0 / empty; “Sign up to start at 0” |
| Specials promo codes visible logged-out | P0 trust | Guest UX PR: teaser until signed in |
| Event “0 RSVPed” everywhere | P0 trust | Guest UX PR: hide zero count |
| Community “Anonymous member” + dead reactions | P0 trust | Guest UX PR: admin name lookup; brand on announcements; “Sign in to react” |
| `/rewards` “more”-only + fan leftovers | P0 trust | Guest UX PR: restaurant loyalty copy |
| Marketplace artist leftovers | P1 | Guest UX PR: community-scoped offers |
| Cookie Decline / referral always set | P1 | Guest UX PR: Accept-only + gate referral |
| Password Turnstile vs FE | P1 | Guest UX PR: password skip (conflicts with #6) |
| Gold/Platinum empty vs marketing; Premium vs Bronze–Platinum | P1 | Guest UX PR: stop selling empty SKUs; clarify tier systems in copy |
| Footer memberengage support / For Brands in primary nav | P1 | Guest UX PR: `support@brandengagepro.com`; For Brands footer-only |
| Stale Upcoming dates; +100 vs +25 perk naming | P1 | Guest UX PR: filter past events; +100 welcome / +25 check-in |
| Brand CTA “Shop drops” | P1 | Guest UX PR: → View rewards / check-in |
| Redeem shipping language (G6) | Follow-up | Not in this PR |
| Nellie's “Live Music — Rooftop” restaurant events | OK | **Do not remove** |

Security P0s (debug route, email blast, cron auth) remain in **PR #7** — separate from guest UX.

---

## Method

- Repository inspection on `main` @ `e24b443` + live HTTP probes to production.  
- No invented metrics (traffic, conversion, costs).  
- No Vercel/Supabase dashboard access; env presence inferred only where live behavior proves it (cron 401 ⇒ secret set; debug route proved project ref).  
- PR #5 findings re-verified; guest path added; PR #7 addresses the three original P0 code items only.  
- Guide guest walk mapped above to a focused guest-UX fix PR (separate from #7).
