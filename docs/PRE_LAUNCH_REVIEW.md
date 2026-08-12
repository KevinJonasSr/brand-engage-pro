# Brand Engage Pro — Pre-Launch Readiness Review

**Date:** 2026-08-12  
**Repo:** `KevinJonasSr/brand-engage-pro` @ `main` (`e24b443` and ancestors)  
**Live URL probed:** https://brand-engage-pro.vercel.app  
**Supabase project (from live `/api/debug-supabase`):** `enfpviapxvqyoarwwsuf`  
**Scope:** Investigate-only. No production code changes in this PR — findings only.

---

## Safe to launch?

**Not yet — block on P0 items below.**

With a single trusted brand (Nellie's) and a tiny admin set, several multi-tenant IDORs are lower operational risk today, but two issues are launch-blocking regardless of scale:

1. **Unauthenticated diagnostic route is live** and creates Auth users on every GET.
2. **Admin email broadcast ignores brand/tier scope** and can blast the entire Mailchimp audience.

After those are fixed (and env/migration checklist below is confirmed), a **soft launch for Nellie's** is reasonable with the P1 caveats listed. Do **not** treat multi-brand / multi-admin as safe until community-scoped admin actions are finished.

---

## P0 — Fix before public go-live

### 1. `/api/debug-supabase` is live, unauthenticated, and mutates Auth

| | |
|---|---|
| **Where** | `frontend/app/api/debug-supabase/route.ts` |
| **Verified** | `GET https://brand-engage-pro.vercel.app/api/debug-supabase` → **200**, returns `urlPrefix`, anon/service key prefixes + lengths, `brandsCount`, `authListUsers`, and **creates** `bep-probe+…@example-debug.invalid` users (`userCreated: true`) |
| **Why it matters** | File comment says “TEMPORARY — DELETE before public launch.” It leaks infrastructure fingerprints and pollutes `auth.users` / member triggers on every hit. Anyone on the internet can call it. |
| **Origin** | BEP-specific leftover diagnostic (not needed for Fan Engage parity). |

**Action:** Remove the route (or hard-gate behind super-admin + `CRON_SECRET` / Basic Auth) and redeploy immediately. Clean up probe users in Supabase Auth.

---

### 2. Admin broadcast email is not brand- or tier-scoped

| | |
|---|---|
| **Where** | `frontend/app/admin/broadcast/actions.ts` (`sendBroadcast`), `frontend/lib/broadcast.ts` (`broadcastEmail`) |
| **Verified in code** | SMS path passes `brandSlug`. Email path calls `broadcastEmail({ subject, body })` with **no brand filter**. `allowedMemberIds` for tier filtering is computed then **never used**. `broadcastEmail` creates a Mailchimp campaign against the **entire** `MAILCHIMP_AUDIENCE_ID` list (documented in-file). |
| **Why it matters** | Choosing “email” or “both” from `/admin/broadcast` can message every subscribed contact, not the selected brand/tier. Carrier/compliance and brand-trust risk. |
| **Origin** | BEP broadcast UI layered on FE-style Mailchimp blast helper. |

**Action:** Disable email channel in UI until segmented, **or** implement Mailchimp segment/tag targeting and apply `allowedMemberIds`. Do not soft-launch SMS+email “both” as-is.

---

### 3. Cron auth is **not** uniformly fail-closed (contradicts HANDOFF)

| | |
|---|---|
| **Where** | `frontend/lib/cron-auth.ts` vs individual cron routes |
| **HANDOFF claim** | “All 12 cron routes now use `verifyCronAuth()` — fails CLOSED” |
| **Verified in code** | Only **6 of 14** route files import `verifyCronAuth`: `embeddings-backfill`, `tags-backfill`, `refresh-monthly-credits`, `daily-admin-brief`, `send-event-reminders`, `weekly-member-digest`. |

**Fail-open when `CRON_SECRET` unset** (run if secret missing):

- `fraud-scan`, `moderation-backfill`, `post-drafts`, `thread-summary-backfill`, `alt-text-backfill`, `moderation-explain`, `drops-notifier` — pattern `if (expected) { check auth }`
- `anniversary-celebrate` — explicitly allows when unset; also accepts `?secret=`

**Live mitigation:** Unauthenticated probes to cron routes currently return **401**, so `CRON_SECRET` appears set in Vercel today. Fail-open remains a footgun on misconfigured redeploy.

| Route | In `vercel.json` | Auth helper |
|---|---|---|
| send-event-reminders | yes | `verifyCronAuth` |
| refresh-monthly-credits | yes | `verifyCronAuth` |
| embeddings-backfill | yes | `verifyCronAuth` |
| daily-admin-brief | yes | `verifyCronAuth` |
| weekly-member-digest | yes | `verifyCronAuth` |
| tags-backfill | **no** | `verifyCronAuth` (unscheduled) |
| drops-notifier | yes | fail-open if unset |
| anniversary-celebrate | yes | fail-open + query-param secret |
| moderation-backfill | yes | fail-open if unset |
| thread-summary-backfill | yes | fail-open if unset |
| post-drafts | yes | fail-open if unset |
| moderation-explain | yes | fail-open if unset |
| alt-text-backfill | yes | fail-open if unset |
| fraud-scan | yes | fail-open if unset |

**Action:** Route every cron through `verifyCronAuth`. Add `tags-backfill` to `vercel.json` or delete/disable it. Remove `?secret=` acceptance on anniversary.

---

## P1 — Should fix before or immediately after soft launch

### 4. Cross-tenant / global admin mutations (IDOR-style)

Admin layout gates “is admin,” but many mutations do not re-check **community ownership** of the target row. Service-role client bypasses RLS.

| Action | File | Gap |
|---|---|---|
| `updateRewardAction` / `toggleRewardActiveAction` | `frontend/app/admin/rewards/actions.ts` | Updates by `rewardId` only — brand admin can toggle **global** (`community_id` null) or another brand’s reward |
| `markFulfilledAction` / `cancelRedemptionAction` | same | No `community_id` check; cancel trusts client `memberId` + `pointCost` for refunds |
| `createOfferAction` / `toggleOfferActiveAction` | `frontend/app/admin/offers/actions.ts` | Uses `getAdminUser()` only; insert omits `community_id`; list is unscoped |
| `adminDeletePostAction`, pin/delete comment/entry, `adminSuspendMemberAction` | `frontend/app/admin/community/actions.ts` | Any admin can act on any post/member ID |
| Member dossier | `frontend/app/admin/members/[id]/page.tsx` | `select("*")` by id — PII across brands for single-brand admins |

**Also:** HANDOFF backlog (~28 actions still on `getAdminUser`) is still accurate — see grep hits under `frontend/app/admin/**` and community prediction actions.

**Blind spot parallel to “null `community_id` global rewards”:** `rewards_catalog` explicitly allows global rows (`0021_rewards_redemption.sql`). Admin UI includes them (`.or(..., community_id.is.null)`) and mutations do not protect them. Same class of bug for **offers** created without `community_id`.

---

### 5. Dual loyalty catalogs (`offers` vs `rewards_catalog`)

| Surface | Table |
|---|---|
| `/brands/[slug]/rewards` redeem flow | `rewards_catalog` + `redeem_reward` RPC |
| `/admin/rewards`, redemptions | `rewards_catalog` |
| `/admin/offers`, marketplace-oriented admin | `offers` |
| Migration `0037_nsk_jge_rewards.sql` | seeds **`offers` only** |
| Migration `0048_nsk_full_program.sql` | seeds **both** `offers` and `rewards_catalog` |

HANDOFF “Rewards Catalog (0037)” reads as if redeemable rewards were seeded; 0037 alone does **not** populate `rewards_catalog`. Operators can think catalog is live when redeem UI is empty (or vice versa).

---

### 6. Auth / onboarding gaps

| Issue | Evidence |
|---|---|
| OAuth gated (expected) | `signup-client.tsx` comments — Google/Apple hidden pending custom auth domain; matches `AI_LAUNCH_CHECKLIST.md` |
| Turnstile fail-open | `api/turnstile/verify/route.ts` returns success if `TURNSTILE_SECRET_KEY` missing; widget returns true if site key missing |
| Password login skips Turnstile | `login/page.tsx` — `handlePassword` never calls `verifyTurnstileToken`; only magic-link path does |
| Cookie consent vs referral cookies | Banner stores choice in `localStorage` (`memberengage_cookie_consent`) but does **not** gate cookies. `invite/[code]/set-ref-cookie.tsx` always sets `memberengage_ref`. Decline is cosmetic. |
| Auth callback `next` unsanitized | `auth/callback/route.ts` concatenates `next` onto `origin` with no `startsWith("/") && !startsWith("//")` check used on login/signup |
| Welcome SMS copy still music-coded | `api/member-engage/sms/route.ts` — “keep an ear out”, emoji; Twilio HELP text uses `support@memberengage.app` |

---

### 7. Webhook verification nuances

| Webhook | Status |
|---|---|
| Stripe | Fail-closed if `STRIPE_WEBHOOK_SECRET` missing; `constructEvent` used — good (`api/stripe/webhook/route.ts`) |
| Twilio inbound | Signature checked **only if** `TWILIO_AUTH_TOKEN` set — fail-open otherwise. Also loads **all members** to match phone (`select id, phone…`) — cost/PII scaling issue |
| Stripe seed API | Bearer `STRIPE_SEED_SECRET`, fail-closed if unset — OK, but ensure secret is set only where needed |

---

### 8. AI caption route URL regex is broken

`frontend/app/api/ai/caption-image/route.ts` tests `/^https?\/\//i` (matches `http//`, not `https://`). Node check: `https://x.com` → **false**. Feature returns 400 for valid URLs. SSRF host allowlist never reached.

---

### 9. Member card share URL uses UUID, not profile slug

`frontend/app/me/card/page.tsx` builds `/members/${member.id}` while public profiles are `/members/[profile_slug]` (`lib/data/member-profile.ts`). Shared cards 404 or miss the public profile feature.

---

### 10. Open PRs #3 and #4

| PR | Title | Needed for launch? | Risk if left open / merged |
|---|---|---|---|
| [#3](https://github.com/KevinJonasSr/brand-engage-pro/pull/3) | Superfan Radar port, super-fans admin, `/join` | **No** for Nellie's core loyalty launch | Adds external FAD Supabase client + `fad_*` cookies (also ignore consent decline). Useful later; needs env + product QA. Safe to leave open if not merged cold. |
| [#4](https://github.com/KevinJonasSr/brand-engage-pro/pull/4) | Six staged BEP feature bundles | **No** — largely **already on `main`** | Bundle trees (`_bep_*_bundle/`) duplicate alt-text, fraud, tags, personalized feed, mod-explainer, post-drafts already present under `frontend/`. Blind merge = conflict / double-apply risk. **Prefer close as superseded** after confirming nothing unique remains. |

---

## P2 — Track, not launch-blocking for a single-brand soft launch

- **CI:** Only `.github/workflows/secret-scan.yml` (gitleaks). No `build` / `tsc` / lint workflow. `package.json` has no `typecheck` script though `COLLABORATING.md` / bundles call `npm run typecheck`.
- **Orphan `brand_events`:** Documented in `AI_LAUNCH_CHECKLIST.md` (4 IDs; FK failures in embeddings cron). Still a log-noise / incomplete-search issue until SQL cleanup. Could not re-query live DB from this review; re-run checklist SQL on `enfpviapxvqyoarwwsuf`.
- **Title doubling:** Checklist notes `%s · Brand Engage Pro` double suffix — cosmetic.
- **In-memory rate limits:** Multi-instance Vercel weakens them (HANDOFF backlog) — acceptable at low traffic.
- **CORS on `/api/*`:** Fixed `Access-Control-Allow-Origin` to app URL + `Allow-Credentials: true` (`next.config.ts`). Not reflecting arbitrary origins (good), but broad method allow on all API routes is unnecessary surface.
- **Inherited FE naming:** cookie `fe_admin_community`, storage key `memberengage_*`, reply-to `memberengage.app` — brand/compliance polish.
- **README stale:** “Public app: TBD”, “Supabase: TBD”, “~13 weeks from initial commit” vs live Vercel + HANDOFF project id.
- **COLLABORATING.md** BEP prod URL `brand-engage-pro-jonas-group.vercel.app` vs live `brand-engage-pro.vercel.app`.
- **No `LAUNCH_CHECKLIST.md`** despite COLLABORATING pointing agents at it.

---

## Env / config vs docs

### Required in HANDOFF (still the core set)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, Stripe trio, Twilio trio, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, Mailchimp trio, optional `SLACK_ADMIN_WEBHOOK_URL`.

### Used in code but missing or under-specified in HANDOFF

| Var | Used by |
|---|---|
| `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Captcha (fail-open if absent) |
| `MAILCHIMP_TRANSACTIONAL_API_KEY` | Weekly digest (dry-run if absent) — HANDOFF open item |
| `ADMIN_EMAILS` | Super-admin fallback |
| `ADMIN_BASIC_USER` / `ADMIN_BASIC_PASS` | Optional `/admin` Basic Auth |
| `STRIPE_SEED_SECRET` | `/api/admin/stripe-seed` |
| `NEXT_PUBLIC_VAPID_*` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web push |
| `NETWORK_HUB_ANON_KEY` / `NETWORK_PUBLISHER_KEY` | Jonas Network emit (soft-fail) |
| `NEXT_PUBLIC_SITE_URL` | CORS / some URL helpers |

AI_LAUNCH_CHECKLIST only lists OpenAI / Anthropic / CRON / optional Slack — incomplete for full go-live.

**Could not read Vercel dashboard from this review.** Confirm production values manually; Sensitive env vars do not pull via `vercel env pull` (COLLABORATING §3).

---

## Database / migrations (repo vs checklist)

| Migration | In repo | Doc claims |
|---|---|---|
| `0032_member_profile_handle.sql` | yes (`supabase/migrations/`) | AI_LAUNCH_CHECKLIST: **unchecked** “Run 0032” |
| `0033_socials_and_profile_slug.sql` | yes | Checklist: **run required**; onboard writes `socials` / uses `profile_slug` |
| `0035_checkins.sql` | yes | HANDOFF: applied ✓ |
| `0036_stamp_cards.sql` | yes | HANDOFF: applied ✓ |
| `0037_nsk_jge_rewards.sql` | yes | HANDOFF: applied ✓ (seeds **offers**) |
| `0048_nsk_full_program.sql` | yes | Later fuller NSK seed including `rewards_catalog` |

**Contradiction:** Checklist still asks to run 0032/0033, but production code paths and live signup probe against `enfpviapxvqyoarwwsuf` strongly suggest profile columns/triggers exist. **Verify with checklist SQL** rather than trusting either doc:

```sql
select count(*) filter (where handle is null), count(*) from public.members;
select count(*) filter (where profile_slug is null), count(*) from public.members;
```

Migrations live at repo-root `supabase/migrations/` (48 files). COLLABORATING still says `frontend/supabase/migrations/` — path drift.

---

## Critical path error handling (spot check)

| Path | Notes |
|---|---|
| Join / onboard | Session required; narrow select on success; referral upsert via service role — OK shape. Social handle → `socials` (0033-aware). |
| Rewards redeem | Session + RPC; client shows success state — OK if catalog rows exist. |
| Check-in | Session + rate limit + admin client insert; day idempotency — OK. Relies on service role because RLS only has SELECT for members. |
| Admin broadcast | Authz for brand on SMS; **email path unsafe** (P0). Tier filter dead code. |

---

## Deploy / CI

- Vercel auto-deploy from `main` (docs).
- GitHub Actions: **secret scan only** — no compile gate.
- Local: `npm run build` / `npx tsc --noEmit` / `npm run lint` per HANDOFF; no `typecheck` npm script.

---

## Doc contradictions summary

| Claim | Reality |
|---|---|
| HANDOFF: all crons use fail-closed `verifyCronAuth` | False for 8 routes; 14 route files, 13 in `vercel.json` |
| HANDOFF: “12” cron jobs | `vercel.json` has **13**; plus unscheduled `tags-backfill` |
| AI_LAUNCH_CHECKLIST: run 0032/0033 | Likely already applied; checklist stale |
| HANDOFF 0037 = rewards catalog | Seeds `offers`, not redeem RPC catalog |
| README: URLs TBD / 13-week timeline | App is live on Vercel |
| COLLABORATING: BEP URL `…-jonas-group.vercel.app` | Canonical live host is `brand-engage-pro.vercel.app` |
| COLLABORATING: `LAUNCH_CHECKLIST.md` | File absent in BEP |
| COLLABORATING: migrations under `frontend/supabase/` | Actually `supabase/migrations/` at repo root |
| COLLABORATING: `npm run typecheck` | Script missing from `package.json` |

---

## BEP-specific vs inherited Fan Engage risk

| BEP-specific | Inherited / shared fork risk |
|---|---|
| Live `debug-supabase` diagnostic | Cron fail-open patterns |
| Check-in + stamp cards + broadcast UI | `getAdminUser` without community scope |
| Dual `offers` / `rewards_catalog` + 0037/0048 seed split | Global `community_id` null rewards |
| For-brands / NSK positioning | Cookie consent non-enforcement + `memberengage_*` cookies |
| Orphan `brand_events` cleanup on BEP project | Turnstile / Twilio verify fail-open |
| Open salvage PRs #3/#4 | Mailchimp whole-audience email helper |

---

## Recommended launch sequence

1. **Immediate:** Delete or lock `/api/debug-supabase`; purge probe Auth users.  
2. **Immediate:** Disable admin broadcast email/both (or fix scoping) before any staff uses it.  
3. **Same day:** Unify cron routes on `verifyCronAuth`; confirm `CRON_SECRET` + Stripe/Twilio webhook secrets in Vercel.  
4. **Before multi-admin / multi-brand:** Community-scope rewards/offers/moderation/member actions; protect global catalog rows.  
5. **Confirm DB:** 0032/0033/0035/0036/0037/0048 + orphan events SQL on `enfpviapxvqyoarwwsuf`.  
6. **Close or rewrite PR #4**; treat PR #3 as post-launch optional.  
7. **Refresh** README / COLLABORATING / HANDOFF cron+env sections so the next agent session does not trust stale claims.  
8. Soft-launch Nellie's with SMS-only broadcast, email magic-link + password auth, OAuth still gated.

---

## Method notes

- Findings are from repository inspection + live HTTP probes to production.  
- No Vercel/Supabase dashboard credentials were available; env “set in Vercel” inferred only where live behavior proves it (e.g. cron 401 ⇒ `CRON_SECRET` present; debug route proved project ref).  
- No invented metrics (adoption %, costs, traffic).
