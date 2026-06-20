# Brand Engage Pro — Session Handoff

**Date:** 2026-06-20  
**Purpose:** Drop-in context for starting a new Claude Code session on this project.

---

## What This App Is

Brand Engage Pro is a **business loyalty platform** — restaurants, retail, sports clubs. Each business gets its own page at `/brands/<slug>` with members, tiers, rewards, specials, events, and a community feed. The first live brand is **Nellie's Southern Kitchen** (`/brands/nellies`).

**Do not confuse with Fan Engage Pro** — that is a separate app for super fans of music artists. Both apps were forked from the same codebase so they look similar, but the data models and audiences are completely different.

---

## Key Links

| Resource | Value |
|---|---|
| **Live URL** | https://brand-engage-pro.vercel.app |
| **GitHub** | `KevinJonasSr/brand-engage-pro` (private) |
| **Local path** | `/Users/kevinjonassr/Downloads/brand-engage-pro/frontend/` |
| **Supabase project** | `enfpviapxvqyoarwwsuf` — "KevinJonasSr's Org" |
| **Vercel project** | `brand-engage-pro` |

---

## Tech Stack

- **Framework:** Next.js 16.2.1 (App Router) — read `node_modules/next/dist/docs/` before writing Next code; this version has breaking changes from standard Next.js
- **Database / Auth:** Supabase (`@supabase/supabase-js ^2.104.0`)
- **Payments:** Stripe
- **SMS:** Twilio
- **Email lists:** Mailchimp
- **AI:** Anthropic (Claude Haiku for caption suggestions, alt-text, admin brief, moderation)
- **Search:** OpenAI embeddings → Supabase `content_embeddings` table
- **Deployment:** Vercel (auto-deploy from `main`)

---

## Repo Structure (key paths)

```
frontend/
├── app/
│   ├── brands/[slug]/        # Public brand page (home, rewards, marketplace, events, referrals)
│   ├── admin/                # Admin panel
│   │   ├── brands/           # Brand management
│   │   ├── members/          # Member management
│   │   ├── rewards/          # Reward creation
│   │   ├── offers/           # Specials / offers
│   │   ├── community/        # Community post management
│   │   ├── campaigns/        # Marketing campaigns
│   │   ├── moderation/       # Content moderation
│   │   └── ...
│   ├── api/
│   │   ├── cron/             # 12 scheduled jobs (see vercel.json)
│   │   ├── member-engage/    # onboard, sms, mailchimp
│   │   ├── twilio/           # inbound SMS webhook
│   │   ├── stripe/           # checkout, webhook
│   │   ├── ai/               # caption-image, draft-comment
│   │   └── search/           # vector search
│   ├── onboarding/           # Member signup flow
│   ├── me/                   # Member profile
│   └── (legal)/              # Terms, privacy, policy pages
├── lib/
│   ├── admin.ts              # getAdminUser() / getAdminContext()
│   ├── cron-auth.ts          # verifyCronAuth() — fail-closed cron auth
│   ├── rate-limit.ts         # In-memory rate limiter (auth/member-data/api tiers)
│   ├── brands.ts             # BRANDS static map (fallback if Supabase unreachable)
│   ├── stripe.ts             # Stripe client + helpers
│   ├── supabase/             # server.ts, admin.ts, client.ts
│   └── data/                 # rewards.ts, brands.ts, etc.
└── components/
    ├── simple-markdown.tsx   # Safe markdown renderer for policy pages
    └── ...
```

---

## Database Schema (Supabase `enfpviapxvqyoarwwsuf`)

Key tables — **always switch to this project in Supabase before running SQL**:

| Table | Purpose |
|---|---|
| `brands` | Brand roster (slug, name, tagline, bio, hero_image, accent colors, address, hours, cuisine) |
| `members` | Member profiles (tier, points, phone, email, socials, sms_opted_in) |
| `brand_events` | RSVP-able events per brand (tier-gated) |
| `communities` | Community feed settings per brand |
| `community_posts` | Posts in each brand's community feed |
| `specials` | Recurring offers (tier-gated, optional points_required, redemption_code) |
| `rewards` | Redeemable rewards per brand |
| `purchases` | Reward redemptions |
| `points_ledger` | All point transactions |
| `admin_users` | `(user_id, community_id, role)` — `community_id='*'` = super-admin |
| `content_embeddings` | Vector embeddings for search (OpenAI) |

**Safety check before any destructive SQL:**  
```sql
select 1 from public.brands limit 1;
```
If this errors, you're on the wrong Supabase project.

---

## Auth & Admin System

- **Member auth:** Supabase magic link / email. Members are rows in `members` table, ID = Supabase auth UID.
- **Admin auth:** Table-driven via `admin_users (user_id, community_id, role)`.
  - `community_id = '*'` → super-admin (can administer all brands)
  - Single-brand admins can only see their own brand
- **`getAdminContext()`** (in `lib/admin.ts`) — preferred; returns `{ user, communities, isSuperAdmin, currentCommunityId, role }`
- **`getAdminUser()`** — legacy helper; returns the user but no community scope. Still used in ~28 admin server actions — migrating these to `getAdminContext()` is an open backlog item.

---

## Cron Jobs (vercel.json)

All 12 routes now use `verifyCronAuth()` from `lib/cron-auth.ts` — fails CLOSED (503) if `CRON_SECRET` is missing.

| Route | Schedule | Purpose |
|---|---|---|
| `send-event-reminders` | `*/15 * * * *` | 24h + 1h SMS/email reminders |
| `embeddings-backfill` | `*/15 * * * *` | Catch missed OpenAI embeddings |
| `drops-notifier` | `*/15 * * * *` | Notify members of new drops |
| `moderation-backfill` | `*/15 * * * *` | Auto-moderate community posts |
| `thread-summary-backfill` | `*/15 * * * *` | Summarize community threads |
| `post-drafts` | `0 13 * * *` | AI-draft community posts for admins |
| `moderation-explain` | `*/15 * * * *` | Explain moderation decisions |
| `alt-text-backfill` | `*/15 * * * *` | Generate alt text for images |
| `refresh-monthly-credits` | `0 4 * * *` | Refresh $5 monthly premium credits |
| `daily-admin-brief` | `0 13 * * *` | AI-generated admin brief → Slack |
| `anniversary-celebrate` | `0 9 * * *` | Member anniversary notifications |
| `fraud-scan` | `0 3 * * *` | Heuristic fraud sweep |

---

## Security Hardening (completed 2026-06-20)

The following was ported from Fan Engage Pro's security audit pass:

| Area | What was done |
|---|---|
| Cron auth | All 12 cron routes use `verifyCronAuth()` — fail-closed |
| Mailchimp | Session auth required; tags filtered to allowlist |
| SMS | Session auth required; E.164 phone validation before Twilio call |
| Twilio inbound | `twilio.validateRequest()` signature verification (when `TWILIO_AUTH_TOKEN` set) |
| SSRF | `caption-image` route restricts `imageUrl` to trusted hostnames only |
| Data exposure | `onboard` route narrowed to return only 5 safe fields (not full member row) |
| Rate limiting | `apiRateLimiter` added to `/api/search`; `memberDataRateLimiter` on mailchimp |
| Markdown XSS | `simple-markdown.tsx` encodes quotes in hrefs |

**Open security backlog:**
- Migrate ~28 admin server actions from `getAdminUser()` → `getAdminContext()` with community scoping (medium priority)
- Move SMS/onboard rate limiting to Redis/KV for multi-instance correctness (low priority for current scale)

---

## Features Added 2026-06-20

### Phase 1 — UX Fixes
- Removed dead "Continue Your Journey" hardcoded cards from homepage
- `/for-brands` brand grid now pulls live from DB (was hardcoded 3 brands)
- Mobile card added to signed-out landing page
- Brand hero simplified to 2 primary CTAs + secondary pill row (Follow / Share)
- `primaryCommunity` null-safety fix in member dashboard

### Phase 2 — New Features

#### Visit Check-in QR (`0035_checkins.sql`)
- `POST /api/checkin` — session-required, awards 25 pts/day per brand, idempotent via `source_ref`
- `/brands/[slug]/checkin` — auto-fires on mount; 4 states: loading / success / already-checked-in / unauthenticated
- `components/checkin-qr-card.tsx` — QR card shown at bottom of `/admin/brands/[slug]` for staff to print/display
- `lib/data/checkins.ts` — `recordCheckin()`, `getMemberCheckinCount()`, `getBrandCheckinsToday()`

#### Stamp Card (`0036_stamp_cards.sql`)
- `stamp_card_configs` table — per-brand config (stamps_required, reward_title). Configure via SQL or future admin UI.
- `components/stamp-card.tsx` — visual stamp grid, "Reward ready!" banner, links to check-in page
- Stamps derived from checkins count — no separate stamp rows needed
- Shown on `/brands/[slug]` for signed-in members with an active config

#### Activity Pulse Strip
- `lib/data/activity-pulse.ts` — `getActivityPulse(brandSlug)` via `Promise.allSettled`; returns checkins today, RSVPs this week, posts this week, new followers this week
- `components/activity-pulse.tsx` — pill row above LatestStrip on brand pages; hides zero-value pills; returns null if all zero

#### Shareable Member Card (`/me/card`)
- Server component showing tier badge, total points, progress bar to next tier, badges + referrals stats
- `ShareButton` with native share API fallback
- Linked from `/me` account page

#### Admin Broadcast UI (`/admin/broadcast`)
- `app/admin/broadcast/page.tsx` — tier filter (all/bronze/silver/gold/platinum), channel (SMS/email/both), 160-char SMS counter, confirm checkbox
- `app/admin/broadcast/actions.ts` — `sendBroadcast()` server action; community-scoped; writes audit row to `campaigns` + `campaign_items`
- `previewRecipientCount()` helper for recipient estimates

#### Weekly Member Digest Cron
- `POST /api/cron/weekly-member-digest` — runs Sundays at 11pm UTC (added to `vercel.json`)
- Iterates all members, calls `gatherWeeklyRecap()`, sends via Mailchimp Transactional (Mandrill)
- Graceful dry-run if `MAILCHIMP_TRANSACTIONAL_API_KEY` not set

### Rewards Catalog (`0037_nsk_jge_rewards.sql`)
- **15 NSK rewards** seeded: dining, experience, merch, digital — Bronze through Platinum
- **22 JGE rewards** seeded: access/experience, tickets, digital content, merch — Bronze through Platinum
- All use `on conflict (slug) do nothing` — safe to re-run

### Open Items from This Session
- `MAILCHIMP_TRANSACTIONAL_API_KEY` needs to be added to Vercel env for weekly digest to send
- DB migrations `0035` + `0036` applied to `enfpviapxvqyoarwwsuf` ✓ / `0037` applied ✓
- Stamp card admin UI (set stamps_required / reward_title per brand) — currently SQL-only
- Check-in history view on `/me` — not yet built
- Admin broadcast `brand_slug` is community-scoped correctly for multi-brand admins

---

## Required Environment Variables (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL              # https://brand-engage-pro.vercel.app (or custom domain)
CRON_SECRET                      # Must be set — all cron routes fail 503 without it
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET            # whsec_... from Stripe dashboard
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_MESSAGING_SERVICE_SID     # or TWILIO_DEFAULT_FROM
ANTHROPIC_API_KEY
OPENAI_API_KEY                   # for vector search embeddings
MAILCHIMP_API_KEY
MAILCHIMP_SERVER_PREFIX          # e.g. us21
MAILCHIMP_AUDIENCE_ID
SLACK_ADMIN_WEBHOOK_URL          # optional — admin brief posts here if set
```

---

## Active Brand Roster

| Slug | Brand | Status |
|---|---|---|
| `nellies` | Nellie's Southern Kitchen | Live (Charlotte + Chicago) |
| `jonas-group-ent` | Jonas Group Entertainment | Live |

More brands will be added via `/admin/brands/new` as they onboard.

---

## Known Caveats

1. **Next.js version:** This is Next.js 16.2.1 — not standard Next 14/15. Read `node_modules/next/dist/docs/` before writing any new Next.js-specific code. Middleware is called "proxy" in this version.
2. **Two Supabase projects in same org:** The Supabase SQL editor defaults can switch between projects unexpectedly. Always verify you're on `enfpviapxvqyoarwwsuf` before running mutations.
3. **`BRANDS` fallback map** in `lib/brands.ts` is used when Supabase is unreachable — it doesn't auto-update when you add brands via the admin panel. New brands should be added to this map manually if hard-coded fallback behavior matters.
4. **`npm audit`:** 2 moderate `postcss` vulns inside Next.js internals — unfixable without downgrading Next to 9.x. Not actionable.

---

## Recent Git History

```
f76dfc6  feat(rewards): seed NSK + JGE offers catalog (37 rewards across all tiers)
e9dfd0b  feat: QR check-ins, stamp cards, activity pulse, member card, broadcast UI, weekly digest
dcc8a3c  Port Fan Engage Pro security hardening to Brand Engage Pro
bd62b1e  feat(a11y): bump base font-size 17→18px
2c56d65  feat(a11y): increase font size sitewide
cdd1d2a  feat(offers): admin can upload image per offer
a50bd7e  feat(privacy): /me/privacy page
```

---

## Good Starting Commands

```bash
cd /Users/kevinjonassr/Downloads/brand-engage-pro/frontend

# Install deps
npm install

# Dev server
npm run dev

# Type check
npx tsc --noEmit

# Build
npm run build

# Lint
npm run lint
```
