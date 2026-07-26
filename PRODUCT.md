# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Responsive, installable PWA (`frontend/public/manifest.json` `display: standalone`; `sw.js` exists for push only and deliberately carries no caching strategy). No native code — no Capacitor, Expo, or React Native, no `ios/` or `android/`. `docs/STRATEGY_AND_SPEC.md` §5 lists native apps as an explicit V1 non-goal with wrappers in V2.

## Users

**1. Member — the consumer, and the primary user.** Table `members`; `members.id == auth.uid()`, which RLS depends on. Not a deal hunter — per the spec, "someone who already loves the brand. Not a deal-hunter — a regular." Job: follow the brands they already go to, earn points by engaging rather than only spending, redeem perks, and feel like an insider. Surfaces: `/` (Member Home), `/brands`, `/brands/[slug]` and its `community` / `rewards` / `leaderboard` / `founders` pages, `/marketplace`, `/rewards`, `/referrals`, `/search`, `/premium`, `/me` (+ `notifications`, `anniversaries`, `privacy`), `/settings/notifications`, `/inbox`, `/members/[slug]`, `/invite/[code]`, auth and onboarding including `/onboarding/chat`.

**2. Premium member.** `member_community_memberships.subscription_tier ∈ {premium, past_due, comped}`. A paid subscriber to **one brand's** club. Perks in `app/premium/page.tsx`: behind-the-scenes feed, early ticket access, exclusive drops, monthly AMA, premium badges, 1.5× points, monthly store credit, VIP events.

**3. Founding member.** `is_founder` + `founder_number`, capped by `communities.founder_cap`. Badge `founding-member`. Surfaces: `/brands/[slug]/founders`, `/admin/founders`, `/share/founder/...`.

**4. Brand admin / operator.** `admin_users (user_id, community_id, role)` with role enum `owner` | `admin` | `editor` | `viewer`. Per spec §2a: independent restaurants and small groups of one to ten locations, owner-operator decision making, a $50–500/month tooling budget. Job: publish specials, posts, and events; see who the regulars actually are; fulfil redemptions. Surfaces: all of `/admin/*`.

**5. Super admin — platform operator.** `admin_users` row with `community_id = '*'`; active community in the `fe_admin_community` cookie (an FE leftover). Legacy `ADMIN_EMAILS` allowlist prevents lockout. Optional HTTP Basic gate on `/admin/*`.

**6. Brand applicant — pre-customer.** Submits `/for-brands/apply`, reviewed at `/admin/applications`. The form asks for brand name, tagline, bio, slug, hero image, contact details, category, number of locations, primary city, years in business, approximate monthly transactions, existing loyalty tooling, whether they run a street team, what makes their community special, expected launch date, and attribution.

## Product Purpose

A community-driven loyalty platform for brands: a place where consumers discover and join the restaurants, retailers, sports clubs, and hotels they already love, and get rewarded for engagement rather than only for spend. The framing, from `README.md`: "Most loyalty programs are punch cards in disguise."

The thesis, quoted from `docs/STRATEGY_AND_SPEC.md`: "loyalty as a category is over-served on the transactional side and under-served on the community side… We're not trying to out-execute Toast Loyalty's POS depth; we're building the loyalty product that makes a customer feel like part of the brand."

The gap it exists in, §1: the SMB owner today chooses between a free POS-bolted plugin — transactional, no community — and a $300/month marketing tool — overkill, no community — "with nothing in between that treats their regulars as a community to cultivate." §4 net: "the SMB community-driven loyalty seat is open. The product nobody has shipped is 'Patreon for brands.'"

**V1 lead vertical: restaurants, "full stop" (§13). V1 launch customer: Nellie's Southern Kitchen, Belmont, NC.**

**Success targets, from §10 — all of these are targets, none are results:**

- 90 days post-launch: 10 paying brands at $49+/mo (~$500 MRR), 100 free-tier brands, 1,000 consumer signups, 30% MAU/registered, <5% paying-brand churn.
- Year 1: $10K MRR (~200 paying brands at ~$50), 5,000 active consumer members, 50% of new brand signups completing the onboarding wizard, at least 20% of members reaching Silver.
- Weekly leading indicators: new brand signups per week; share of brands publishing at least one post within 7 days (activation); share still posting in week 4 (retention); consumer signups per active brand; posts per active brand per week.

## Positioning

**The differentiating mechanism, quoted from §3: "Engagement-earned status, not just spend."** Bronze → silver → gold → platinum are earned through points, and points are earned through engagement — posting a photo of your meal, voting in a poll about the next special, completing a challenge ("post a selfie at all 4 game days this season"), RSVPing to a tasting. "This makes status feel earned by being a real member, not just by having money." This is structurally uncopyable by POS-bolted loyalty, whose points ledger is a function of transaction volume by definition.

Supporting mechanisms:

**Community-first loyalty.** Posts, polls, challenges, comments, and reactions live on the brand's club page. The spec's claim: "No competitor in the loyalty category does this depth of social."

**Multi-vertical from one codebase.** One consumer login can span a hotel that owns a restaurant that owns a merch store; cross-brand discovery becomes a feature.

**Per-competitor claims (§4).** Against Toast Loyalty — a brand can grow loyalty without switching POS. Against Thanx — freemium versus enterprise contracts. Against FiveStars — a content surface, not just a swipe. Against Patreon — for businesses, not individual creators.

**Explicit non-positioning (§3):** not a POS, not a CRM, not a marketing automation tool, not a deals or coupon site, not a review platform.

## Operating Context

**Naming, as of this record.** The product is **Brand Engage Pro**, and its sibling is **Fan Engage Pro**. This closes the spec's standing "Working name: TBD" and retires the §12 shortlist (Inner Circle, Loyal, Clubhaus). It also settles the parent-product name, which the repo currently gives two different ways: `README.md` and `docs/` say "Member Engage" while `COLLABORATING.md` says "Fan Engage" — both refer to Fan Engage Pro.

**Lexicon.** Brand Engage Pro speaks **member** and **brand**; **club** in user-facing copy while the database keeps `community_id`. Fan Engage Pro speaks fan and artist. Both vocabularies are currently live here — 28 occurrences of "member club" in app code alongside `/admin/community`, the `communities` table, and `member_community_memberships`.

**Confirmed naming debt to reconcile.** `memberengage.app` is still hardcoded across the subdomain resolver, support and no-reply addresses, and the `memberengage_ref` and `memberengage_cookie_consent` cookies. Route namespace `/api/member-engage/*` carries the old name. A find-and-replace pass damaged `docs/STRATEGY_AND_SPEC.md` itself, producing unreadable output — "`brands` | `brands`", "`member` → `member`", "what an **brand member club** does for a musician's supermembers." **The spec's rename map is unusable as written; the operative map lives in `COLLABORATING.md` §7 and `docs/AI_INFRASTRUCTURE.md`.** Same artifact in shipped code: the welcome SMS says "follow **an brand**, RSVP to an event" with a music emoji. The service worker header says "Brand Engage" and refers to focusing an existing "FE" tab.

**Lineage.** Brand Engage Pro is a fork of Fan Engage Pro that went through a full `artist→brand` / `fan→member` rename; the schemas now diverge in many small ways. Migrations `0001`–`0023` are inherited; `0024_restaurant_fields_and_specials.sql` is the first BEP-specific one. Fixes are ported in both directions, so the FE originals stay relevant.

**Port hazards that have already caused hotfixes** (`COLLABORATING.md` §7): `brand_events.event_date` is **text** where FE's was timestamptz, with `event_starts_at` added later as the real timestamptz; FE's `artist_events.description` became `brand_events.detail`; `notify_comments_my_post` became `notify_comment_my_post`, singular, which "bit me twice"; FE `rewards` became BEP `offers`; FE's `artists.slug` is the primary key with no id column; the signup components have different shapes and export styles between the two repos, which cost four hotfix commits. **The `nellies` slug exists on FE but belongs here — never activate it there.**

**Deploy.** GitHub `KevinJonasSr/brand-engage-pro` → Vercel `jonas-group/brand-engage-pro`. Supabase project `enfpviapxvqyoarwwsuf`. Preview/prod at `https://brand-engage-pro-jonas-group.vercel.app`. **Custom production domain is undecided** — `README.md` says TBD; `brandengagepro.com` appears only as an example.

**The bundle ritual.** Built around the constraint that the agent has no write access to the working tree and that `git push` stays a human decision. The agent writes `outputs/_<bundle>/apply.sh`, which patches via idempotent Python anchor-replace (anchors check both old and new text), runs typecheck, commits, prints `Push: git push`, and stops. **Do not auto-push.** Six such bundles are still checked into the repo root.

**Migrations are run by hand** in the Supabase SQL editor, with the same last-statement-only trap as FE: run `INSERT`s alone, use `RETURNING` in the same statement. Agents may drive the editor via Chrome MCP. **The migration tree is split and colliding:** repo-root `supabase/migrations/` (34 files) and `setup/` (4 files) both number 0026–0029, and `COLLABORATING.md` points at `frontend/supabase/migrations/`, which does not exist.

**Smoke-test ritual.** `curl -sI https://<repo>.vercel.app/<route> | head -1`; `?testEmail=` for crons; for UI, take a screenshot through Chrome MCP and look at it before declaring done. Secrets via `openssl rand -hex 32` — base64 `+`/`/` get mangled, and Vercel "Sensitive" vars return empty from `vercel env pull`.

**Cron.** 12 Vercel cron jobs in `frontend/vercel.json`, all bearer-authenticated with `CRON_SECRET`.

**Integrations confirmed in code.** Supabase (Postgres, Auth, Storage — the `community-uploads` bucket must have public read), Stripe (webhook plus per-community product and four prices seeded idempotently), Twilio (welcome SMS and inbound auto-reply; 10DLC registration is brand-by-brand), Mailchimp (route exists but is documented as FE-only, so smart digests are blocked until BEP has its own config), Slack (optional daily admin brief), OpenAI embeddings, Anthropic Claude Haiku for drafts/captions/alt text/briefs/fraud verdicts, Web Push.

**Square and Toast POS are not integrated.** They appear only as dropdown options describing an applicant's current tool, and migration 0024 lists POS credential tables as an explicit V1 deferral.

**Admin/ops.** Application → review at `/admin/applications` → guided setup wizard → flip the hub live. `/for-brands` states the SLA: response within 48 hours, approved application to live hub in two to four weeks. Redemptions are fulfilled from `/admin/redemptions` in two clicks. Moderation in V1 is the brand admin moderating their own. Physical fulfilment stays in the brand's existing workflow.

## Capabilities and Constraints

**V1 shape — confirmed decision.** Brand Engage Pro is **curated and hand-provisioned through V1**. Brands are onboarded by application and review, not self-serve claiming. Self-serve freemium signup and the multi-brand consumer marketplace are stated Phase 2 goals, not V1 capabilities.

This matches the code, which future work must not overstate: `middleware.ts` and `lib/community.ts` hard-default every BEP request to the `raelynn` community "until wildcard DNS is pointed at the platform." There is no `/discover` route. `/brands` filters by `genres` — a music leftover — rather than `brands.category`. `brands.lat`/`lng` exist with no proximity query. **Cross-brand discovery is a stated differentiator that is not yet shipped; do not design as though it is.**

Two decisions the marketplace phase will force, both currently open: the free-tier member cap (spec §11 Q4 asks whether 50 is right — "lower forces conversion sooner; higher attracts more long-tail brands"; nothing is enforced in code today), and brand identity verification (§11 Q6: "self-serve means anyone can claim a brand page," with proof of address, Google My Business, or manual review all unresolved — today the only path is manual, and the trademark takedown flow does not exist).

**Consumer capabilities.** Member Home with real KPIs; brand discovery index, brand hub, community feed, per-brand rewards, leaderboard, founders wall; points and the four-tier ladder; badges with premium-gated prestige slugs; rewards catalog and redemption; a marketplace of offers; **specials** with redemption codes on an honour system; events with RSVP, capacity, and ICS export plus 24h/1h reminders; referrals and invite QR codes; per-brand premium checkout with founder slots; public opt-in member profiles that strip email, phone, Stripe ids, last login, and moderation flags; share infrastructure with per-brand OG cards; web push, SMS, in-app inbox, and granular notification preferences; streaks, weekly recap, drops with countdown, leaderboard, predictions and polls, anniversaries; semantic search; self-service privacy; conversational AI onboarding.

**Brand admin capabilities.** Brand profile editor with hero focal-point picker; specials, offers, and rewards managers; events; community composer for posts, announcements, polls, challenges, and video; member list and detail; redemptions queue; challenges; predictions; campaigns and segments; moderation queue and fraud signals; per-community analytics; briefs; policies; founders; Stripe seeding; community switcher.

**AI shipped.** Embeddings and pgvector; AI-drafted comment replies (three chips, ≤25 words, distinct stances, with an A/B `draft_used` flag); semantic search; image captions (three chips, deliberately opt-in, `caption_used` flag); daily admin brief with rule-based anomaly detection; AI alt text; member-facing moderation explainer; tag suggester; thread summarisation; auto-segmentation; personalised "Picked for You" feed; fraud detection v1; nightly auto-generated brand post drafts; prediction suggestions; dedupe.

**Technical constraints.** Next.js 16 App Router with RSC — `frontend/AGENTS.md` carries one hard rule: **"This is NOT the Next.js you know."** Read the relevant guide in `node_modules/next/dist/docs/` before writing code. TypeScript strict, and every bundle gates on `npm run typecheck` — **but no `typecheck` script is actually defined in `package.json`**, despite the workflow depending on it. Multi-tenancy resolves from hostname to an `x-community-id` header; middleware also stamps `x-pathname` because without it the admin layout falls into a redirect loop on `/admin/communities`.

**Tier gating is the real access gate:** `lib/entitlements.ts::canAccess(contentTier, viewer)` over `public | premium | founder-only`, returning reasons `public`, `premium-member`, `founder-member`, `needs-premium`, `needs-founder`, `signed-out`. `specials.tier` and `brand_events.tier` use the same three values. Every gated surface should surface the reason, not just the denial.

**Known data defects.** `points_ledger` has **no `community_id` column**, so per-community points attribution is impossible today and the admin brief can only show platform totals. `members` has no signup IP, so IP-based bot detection is deferred. Four orphan `brand_events` rows fail to embed because the cron uses `brand_slug` as a `community_id` FK'd to `communities.slug`. Migration `0032` has **not been run in BEP production**, and public member profile pages depend on it. Page titles double (`X · Brand Engage Pro · Brand Engage Pro`).

**Verticals.** `brand_category` is `restaurant | retail | sports | hotel`, plus `entertainment` added later. The application form offers a wider list. `brands.cuisine` is free-form text in V1 and may become an enum once usage stabilises.

**Terminology.** brand · member · club (UI) vs community (DB) · founder, Founding Member, founder_cap · **special** (recurring, RRULE or ISO weekday list, carries a redemption code) vs **event** (one-shot, RSVP-able, capacity) vs **offer** (marketplace item) vs **reward** (catalog + redemption) · tier ladder bronze→silver→gold→platinum · points · badge · drop · prediction · challenge · poll · broadcast · segment · brief · streak · anniversary.

**Explicitly undecided — all commercial terms.** No pricing is ratified. The documented $0 / $49 / $149 brand SaaS tiers are **not implemented anywhere in code** — there is no plan concept, no 50-member cap enforcement, no "Powered by" footer toggle, no CSV import gate. What *is* in the schema is a different model entirely: per-community consumer membership defaults of `monthly_price_cents = 1000` and `annual_price_cents = 9900` with `founder_cap = 100` and founder prices held as separate Stripe price ids so standard pricing can rise without migrating founders. **Treat all of it — both the documented tiers and the schema defaults — as unratified.** A final number is required before Stripe Connect KYB. Stripe Connect is a V1 non-goal; V1 routes through a single platform account. Future revenue paths in §7 (SMS metering, Connect splits, promoted marketplace spots, cross-brand sponsored campaigns) are hypotheses. **Future work must not state a price, a cap, or a split as fact.** `/for-brands` already handles this correctly: pricing is reviewed with the brand team at onboarding, no payment or contract required to apply.

**No brand agreement exists.** `/for-brands` answers data-ownership questions with "confirmed in the brand agreement at onboarding" — that agreement has not been drafted.

## Brand Commitments

**Names.** Product: **Brand Engage Pro**. Sibling: Fan Engage Pro. Parent: Jonas Group.

**There is no product logo or wordmark.** `assets/` contains only `.gitkeep.txt`; `frontend/public/` has generic framework SVGs plus three placeholder app icons. The manifest description is "Your member club — rewards, community, and brand drops," and its `categories` are still `["music","entertainment","lifestyle"]` — stale, with no restaurant or food category.

**Per-brand identity is a product fact.** Each brand sets its own accent pair and hero focal point, so platform-level visual decisions must survive arbitrary brand palettes. The Nellie's seed migration documents the standard to hold: charcoal → warm gold, "pulled from the iron signage and platinum-record palette in the photos," explicitly avoiding "the generic 'Southern red' trope" and chosen to read against a dark hero overlay. Brand accents are researched from the brand's real material, not defaulted.

**Voice, as evidenced by shipped copy.** Plain-spoken, second-person, operator-literate, benefit-first, anti-jargon. Consumer hero: **"Skip the line. Earn the perks. Become a regular."** Sub: follow the brands you love, earn points for every visit and every engagement, unlock real perks — exclusive drops, members-only events, first access casual customers never get. Trust microcopy: "Free · 60 seconds · No credit card"; "No credit card. No spam. Just the brands you love and the perks they reserve for the regulars." Section headers: "More than a mailing list. A real member club."; "Three steps from casual visitor to regular." Brand-side hero: **"Loyalty that actually rewards your regulars."** A repeated anti-platform-dependency line: without renting attention from social platforms; doesn't live behind someone else's ranking algorithm. The application form asks for voice, not polish: "A paragraph or two. Voice + story matter more than corporate-speak."

**Two codified honesty commitments — treat these as binding brand rules:**

1. `app/page.tsx` — render zeros rather than fake marketing numbers, "so nothing ever lies"; featured offers come from the DB only, "no more fallback/lie content."
2. `app/for-brands/page.tsx` — deliberately does not invent legal terms, pricing, or performance metrics; uses qualitative proof and "confirmed in onboarding" language until the Brand Agreement is final.

## Evidence on Hand

**Real and usable — this is unusually good source material, use it.**

**Nellie's Southern Kitchen**, slug `nellies`, tagline "It feels good to be home." 36 N. Main St., Belmont, NC 28012. Southern cuisine; hours seeded and later corrected; socials including OpenTable. Nine real photographs on disk under `frontend/public/brands/nellies/` — hero sign, mark, biscuits, dining room, interior bar, memorabilia hallway, Belmont sunset — plus two press images. Real press: **Charlotte Magazine's "25 Best New Restaurants"** and the **Chicago Tribune's "7 must-visit Southern restaurants."**

The Nellie's bio in migration 0026 is real, hand-written, and worth designing around: a love letter to Nellie Jonas, a Belmont woman and working cook who believed nobody should leave the table hungry; doors opened June 2016; chicken 'n' dumplings, drunken collard greens, shrimp and grits, fried chicken on a Sunday, made in-house, never frozen; "the dining room is loud on purpose"; servers who actually sing, with a band, on weekend nights; a back hallway lined with platinum records and family photos.

**Four real seeded specials:** 2-for-1 Fried Chicken Tuesdays (public); Bottomless Biscuits at Sunday Brunch (public); The Memorabilia Hallway Tour (**founder-only**, first Saturday monthly by reservation — "hear the story behind every gold record, magazine cover, and Camp Rock poster on the wall"); Reserved Booth on Live Music Nights (**premium**, with complimentary drunken collard greens).

**Three real seeded events**, with dates explicitly flagged as placeholders to refine via admin: Sunday Supper Series — Live Band Night (capacity 80, public); Biscuit-Making Class with the Kitchen (capacity 16, premium, apron and recipe card to take home); Belmont Block Party — Community Cookout (uncapped, public, a percentage of sales to the Belmont food pantry). One real reward: Nellie's Apron + Recipe Card, Bronze+, 1,500 points.

**Also seeded:** Jonas Group Entertainment with real hero and logo assets, which deliberately keeps music-flavoured copy because it genuinely is a music brand inside the platform.

**Does not exist — must not be fabricated.**

- **No testimonials or pull quotes.** `for-brands` carries an explicit TODO to replace the three copywriter-authored "featured brand" taglines with real quotes when they exist.
- **No performance metrics, case-study numbers, MRR, member counts, or engagement-lift figures.** Every number in §10 is a target. The "+30% comment volume" figure is a hypothesis carried over from FE, not a result.
- **No paying brand customers.** The product is pre-launch. Nellie's is the primary design driver, not a paying account.
- No product logo or wordmark; no POS integration; no multi-location support; no custom domain; no Stripe Connect; no white-label.
- **No `LAUNCH_CHECKLIST.md`**, despite `COLLABORATING.md` naming it the source of truth for pending work. Only `AI_LAUNCH_CHECKLIST.md` exists.
- All four pre-launch env vars are still unchecked; without the OpenAI and Anthropic keys every AI feature 503s gracefully.
- OAuth buttons are removed from signup pending a custom Supabase auth domain, because the Google consent screen would otherwise show the raw Supabase project URL.
- **Music-coded placeholder content still ships and must never be mistaken for restaurant evidence:** `/rewards` suggests "Host a listening party (+400 pts)" and "Attend livestream Q&A (+120 pts)" with dead hrefs, and lists "Listening quests — 4,200 pts"; `/marketplace` falls back to "Members-Only Polaroid Pack", "VIP Soundcheck + Meet", "Handwritten Lyric Sheet"; onboarding shows an `@supermember` placeholder. These render only when the DB is empty and they are fake by construction. **Removing them is confirmed work, not a judgement call.**
- Lineage debt still live: `DEFAULT_COMMUNITY_ID = "raelynn"`, `offers.community_id` and `specials.community_id` both defaulting to `raelynn`, the `*.memberengage.app` resolver, the `fe_admin_community` cookie, `/api/member-engage/*` routes, `memberengage_ref`, `support@memberengage.app`, stale manifest categories, and `/brands` filtering by `genres`.
- RaeLynn appears as a featured card on `/for-brands` but is a **Fan Engage Pro artist, not a BEP brand.**

## Product Principles

1. **Never let the interface lie.** Zeros over invented numbers, DB truth over fallback content, no price or metric asserted before it is ratified — and delete the inherited music placeholders rather than letting them stand in for restaurant evidence.
2. **Status is earned by engaging, not by spending.** This is the whole differentiator. Any surface that makes points look like a function of transaction volume undercuts the product.
3. **Design for the regular, not the deal hunter.** The member already loves this place. The job is recognition and belonging, not discounting.
4. **Respect the operator's day.** The brand admin is an owner-operator between shifts, not a marketer at a desk. Publishing a special, seeing who the regulars are, and fulfilling a redemption must each be a two-click job.
5. **The brand's material leads.** Real photographs, real bios, real accent colours drawn from the brand's own signage — as the Nellie's seed already demonstrates. Platform chrome recedes; generic category tropes are a failure.
6. **One brand, done completely, before many.** V1 is curated and restaurant-first. Depth on Nellie's is the proof; marketplace breadth is Phase 2 and must not be implied before it ships.

## Accessibility & Inclusion

**No conformance standard is committed.** WCAG, contrast targets, and automated checks appear nowhere in the repo; the target level is **explicitly undecided** — it was raised in this interview and deliberately left open rather than invented here. Future work should not claim a conformance level.

**What is real and must be preserved:**

- **Base font size is 18px** on `html`, raised in two `feat(a11y)` commits from 16px, with the stated rationale "addresses common member feedback that text is too small to read." The same pass **replaced 164 instances of `text-[10px]` / `text-[11px]` with `text-xs` across 64 component files** — micro-type is a known, corrected defect here, not a style option. The in-file comment still says 17px; the shipped value is 18px. The documented escape hatch is to override locally rather than lower the base.
- **AI alt text is mandatory by design.** `<AltTextSuggester />` auto-fires on image upload with **no button**, deliberately unlike the opt-in caption suggester; `community_posts.image_alt` is rendered as the img alt; a nightly cron backfills anything missed.
- The application form is deliberately dependency-free with no JS validation library, so it degrades gracefully if JS fails to load. Keep that property.

**Known gaps.** Only 26 total `aria-label` / `sr-only` / `role=` occurrences across the entire app. **No `prefers-reduced-motion` handling** despite heavy gradient, blur, rotate, and transition use. Dark-only (`color-scheme: dark`) with heavy low-opacity white text on near-black across the marketing pages, contrast never analysed. Voice submissions, framed partly as an accessibility feature, are deferred.

**Audience note.** The spec's own pronounceability discussion assumes a 60-year-old restaurant owner as a real user, and the member base skews toward long-standing regulars. Legibility complaints have already arrived once from real members — treat type size and contrast as a known-sensitive area rather than an open canvas.
