# Loyalty Platform — Strategy & Product Spec

**Working name:** TBD (see Naming, end of doc)
**Author:** Kevin Jonas Sr. (with Claude)
**Date:** April 26, 2026
**Status:** Draft v1 — for team review

---

## TL;DR

We extract the Fan Engage architecture into a horizontal **community-driven loyalty platform** for brands, leading with **restaurants** in V1 and expanding to retail, sports clubs, and hotels in subsequent phases. Consumers get one marketplace app where they discover and join multiple brands' loyalty programs; brands get a self-serve dashboard to publish specials, run challenges, host events, and reward their most loyal customers — not just their highest spenders. Freemium for the long tail (free brand pages, basic points and rewards), paid tiers for serious operators (custom branding, POS integration, premium content, advanced analytics).

The thesis: **loyalty as a category is over-served on the transactional side and under-served on the community side**. Fan Engage already has the community DNA — posts, polls, challenges, premium memberships, RSVPs, badges — that punch-card and card-swipe tools don't. We're not trying to out-execute Toast Loyalty's POS depth; we're building the loyalty product that makes a customer feel like part of the brand.

---

## 1. Problem statement

Most loyalty programs today fall into one of two failure modes:

1. **Transactional and forgettable** — customer earns points on a card, occasionally redeems for $5 off, never thinks about the brand otherwise. Toast Loyalty, Square Loyalty, Belly, Punchh, FiveStars, Marsello — all variations on this theme. Fine for big chains where scale economics work; lifeless for the indie restaurant, the boutique shop, the local sports club.

2. **Heavy and expensive** — Sailthru, Bond, Salesforce Loyalty Management. Built for enterprise marketers, six-figure implementations, irrelevant to the 99% of brands that just want to make their best customers feel seen.

There's no widely adopted product that does for restaurants/retail/sports/hospitality what an artist fan club does for a musician's superfans: lets the brand publish stuff, lets the customer engage with that stuff, and rewards engagement (not just spend) with status, perks, and access. That's the gap.

Adjacent: the SMB owner today has to choose between a free POS-bolted loyalty plugin (transactional, no community) and a $300/mo marketing tool (overkill, no community), with nothing in between that treats their regulars as a community to cultivate.

---

## 2. Target customer

### 2a. The buyer (brand owner / operator)

Restaurants V1, then expanding:

- **Independent restaurants and small groups** (1–10 locations). Owner-operator decision making, $50–500/mo budget for marketing tooling.
- **Boutique retail** — coffee roasters, breweries, lifestyle stores, bookshops. Same buyer profile.
- **Local sports clubs** — minor league teams, soccer/rugby clubs, university booster organizations.
- **Independent hotels and B&Bs** — ~5–50 rooms, premium pricing tier.

Buyer pains today:
- Loyalty programs feel like a checkbox, not a tool. They install one, never look at it again.
- They have a phone full of "regulars" and no good way to talk to them at scale.
- Mailchimp is impersonal, Instagram is for everyone, SMS is opt-in-friction.
- Punch cards are physical and lossy.
- They want to reward their best customers but don't know who they are.

### 2b. The user (their loyal customer)

- Someone who already loves the brand. Not a deal-hunter — a regular.
- Wants to feel like an insider, not a number on a spreadsheet.
- Will engage with the brand if there's something to engage with: behind-the-scenes content, challenges, polls about the next menu, RSVP-only events.
- Will pay for premium membership if it actually unlocks status (best table, member-only menu, early access to drops, badge flair).

This is the same psychology as a music fan — and we already know how to build for it.

---

## 3. Differentiation

Fan Engage's architecture gives us three angles competitors don't have:

1. **Community-first loyalty** — posts, polls, challenges, comments, reactions all live in the brand's "club" page. Members talk to each other and to the brand. No competitor in the loyalty category does this depth of social. (The closest analog is Patreon, but Patreon is creator-focused; loyalty platforms are membership-card-focused; nobody owns the SMB community-loyalty intersection.)

2. **Engagement-earned status, not just spend** — bronze → silver → gold → platinum tiers can be earned through points, *and points can be earned through engagement*: posting a photo of your meal (+5 pts), voting in a poll about the next special (+1 pt), completing a challenge ("post a selfie at all 4 game days this season" → +50 pts and a "Diehard" badge), RSVP'ing to a tasting (+10 pts). This makes status feel earned by being a real fan, not just by having money.

3. **Multi-vertical from one codebase** — most competitors are single-vertical. We can serve a hotel that owns a restaurant that owns a merch store under one consumer app, with one consumer login. Cross-brand discovery becomes a feature ("members at La Casita also love Brewers Coffee").

What we are explicitly **not** trying to be in V1:

- Not a POS (Toast, Square own that)
- Not a CRM (HubSpot, Klaviyo own that)
- Not a marketing automation tool (Mailchimp, Klaviyo own that)
- Not a deals/coupon site (Groupon, RetailMeNot)
- Not a review platform (Yelp, Google)

We're a loyalty + community surface that brands plug into.

---

## 4. Competitive landscape

| Player | Vertical focus | Approach | Where we win |
|---|---|---|---|
| **Toast Loyalty** | Restaurants | POS-bolted, transactional | Community DNA they don't have. Our brand can grow loyalty without switching POS. |
| **Square Loyalty** | Restaurants + retail | POS-bolted, transactional | Same — community + multi-vertical breadth. |
| **Punchh / PAR Punchh** | QSR enterprise | Marketing automation + loyalty | We're SMB-friendly + community; Punchh is for chains. |
| **Thanx** | Restaurants | Transaction-tied, marketing-led | We're freemium; Thanx is enterprise contracts. |
| **FiveStars** (now SumUp) | SMB retail/restaurants | Card swipe at POS | We give brands a content surface, not just a swipe. |
| **Belly** | SMB | iPad punch-card | Sunset/struggling. We replace this category cleanly. |
| **Marsello** | E-comm + retail | Loyalty + email/SMS | We're community-driven; they're channel-driven. |
| **Yotpo Loyalty** (Swell) | E-comm | Loyalty for Shopify | Different surface — we're brick-and-mortar-first. |
| **Smile.io** | E-comm | Plug-and-play loyalty for Shopify | We're physical-world brands. |
| **Patreon** | Creators | Subscription + community | Closest community analog; we're for businesses, not individual creators. |
| **Stash, Stocard** | Retail | Card aggregator wallet | We're the program, not the wallet. |
| **Open Table / Resy "VIP"** | Restaurants | Reservation-tied loyalty | Adjacent; we focus on engagement, not just bookings. |

**Net:** the SMB community-driven loyalty seat is open. The product nobody has shipped is "Patreon for brands."

---

## 5. Goals and non-goals

### V1 goals (first 90 days)

- Restaurant-only. No retail/sports/hotel-specific features yet.
- Marketplace consumer app where users discover restaurants and join their loyalty programs.
- Free tier for restaurants: brand page, posts, polls, challenges, events with RSVP, points-on-engagement, manual reward redemption, 50 active members.
- Paid tier ($49/mo): unlimited members, custom branding, premium tier (paid members get extra perks), basic CSV import, weekly broadcast (email or SMS), basic analytics.
- 10 paying restaurants by day 90.

### V1 non-goals

- POS integration (Toast, Square, Lightspeed, Clover) — V2.
- White-label / custom domains — V2 paid upgrade.
- Other verticals — V2 (one vertical per quarter).
- Native mobile apps — web-first PWA in V1, iOS/Android wrappers in V2.
- Multi-location complexity — V1 supports one brand = one location; V2 adds multi-location.
- Stripe Connect for brand payouts of paid memberships — V1 routes through one platform Stripe account; V2 splits.

---

## 6. Product overview

Three surfaces:

### 6a. Consumer marketplace app

`https://app.[name].com/` — single consumer login, discover and join many brands.

- **/discover** — browse/search brands by location and category. "Restaurants near me," "Coffee shops," "Sports clubs."
- **/brands/[slug]** — brand profile page (the equivalent of today's `/artists/[slug]`). Shows brand bio, hours, location, upcoming specials, current member challenges, photo wall, member tier ladder, "Join the club" CTA.
- **/brands/[slug]/community** — social feed for members of this brand. Posts from the brand, posts from fellow members, polls, challenges. Same component as today's community page.
- **/** (Fan Home equivalent) — "My clubs" — lists all the brands the user has joined, their tier in each, upcoming specials/events from those brands, recent activity, badges in progress, total points across the network.
- **/rewards** — cross-brand redemption catalog (later) or per-brand redemption pages (V1).

### 6b. Brand admin dashboard

`https://app.[name].com/admin/[brand-slug]` — brand owner's home base.

- **Brand profile editor** — name, tagline, hero image, hours, location, social links, accent colors, category.
- **Specials manager** — create/edit time-windowed specials ("2-for-1 Tuesdays," "Happy Hour 5-7 PM," "Free dessert with entree this week"). Each special has a window, a description, optional image, and a redemption mechanism (member shows code at register).
- **Events manager** — same as today's Fan Engage event tool: create RSVP-able events, set capacity, attach to a date/time, get reminders fired automatically.
- **Community composer** — post / announcement / poll / challenge, with photo and optional video (we already have video support from migration 0022).
- **Members list** — every customer who joined, sortable by tier, points, last activity. Click into each for their profile, history, redemption log.
- **Rewards catalog** — define what members can redeem points for (free coffee = 50 pts, swag = 200 pts, "name on the wall" = 1000 pts, etc.). Same as Fan Engage's rewards system.
- **Broadcast** — send a message to a segment (all members, gold+, opted-in for SMS, etc.). V1 supports email; SMS and per-segment in V2.
- **Analytics** — basic engagement dashboard: member growth, points earned/redeemed, top specials, most active members.

### 6c. Brand onboarding self-serve

The currently-admin-managed artist setup needs to become self-serve.

- **/onboarding-brand** — wizard for new brands. Step 1: brand name, category, address. Step 2: photo + tagline. Step 3: pick a starter rewards catalog (templates per category). Step 4: invite team members. Step 5: paste a QR code link they can put on receipts/menus to grow membership.

---

## 7. Pricing — freemium → subscription

Three tiers, designed to land on a freemium that's actually free (not hostile-trial), and a paid tier that starts paying for itself once a brand has even a small membership base.

| Tier | Price | Member cap | Features |
|---|---|---|---|
| **Free** | $0/mo | 50 active members | Brand page, posts, polls, challenges, events with RSVP, manual rewards (define them, members redeem in person), basic profile editor. Goal: long tail. |
| **Pro** | $49/mo | Unlimited | Everything in Free + custom accent colors, premium tier (paid memberships routed to brand later), CSV member import, weekly email broadcast, basic analytics, removed "Powered by [Name]" footer on brand page. Goal: 80% of paying customers land here. |
| **Premium** | $149/mo | Unlimited | Everything in Pro + SMS broadcasts (Twilio passthrough metered), POS integration (Square + Toast in V2), white-label custom domain (V2), priority support, advanced analytics. Goal: serious operators with proven engagement. |

**Why those numbers:**

- $49 is below Toast Loyalty's published $50/location, deliberate. Beats them on price for the SMB band that doesn't need POS-tied features.
- $149 with SMS + POS is competitive with Punchh's SMB tier and Thanx's entry pricing.
- Free tier with 50-member cap is enough to demonstrate value; brands that get traction will need to upgrade to Pro before they're forced to.

**Future revenue paths once V1 is proven:**

- **Per-SMS metering** — pass through Twilio at +50% margin.
- **Stripe Connect for paid memberships** — take 5–10% on premium memberships brands offer their members ("VIP Club $9.99/mo" — brand keeps 90%, we keep 10%).
- **Marketplace promoted spots** — brands pay to surface on /discover. Adsense-for-loyalty.
- **Cross-brand campaigns** — Coca-Cola sponsors a challenge across 100 of our restaurants ("post a photo with a Coke") and pays us to run it.

---

## 8. Schema deltas from Fan Engage

Most of the existing schema works as-is. The migrations that need explicit attention:

### New (or renamed) tables

| Today | Becomes | Notes |
|---|---|---|
| `artists` | `brands` | Rename + new columns: `category` (enum: restaurant/retail/sports/hotel), `address`, `lat`, `lng`, `hours_json`, `cuisine_or_subcategory`, `phone`. |
| `artist_events` | `brand_events` | Same shape. |
| `fan_artist_following` | `fan_brand_following` | Rename. |
| `fan_community_memberships` | `member_brand_memberships` (or keep) | Could keep as-is — the table is already brand-scoped via `community_id`. |
| `community_posts` | `member_posts` (or keep) | Same — already scoped by `community_id`. |
| `rewards_catalog` | `rewards_catalog` | Keep. |
| _(new)_ `brand_locations` | _(new)_ | One brand → many locations in V2. V1 ignores this and treats `brands.address` as the single location. |
| _(new)_ `specials` | _(new)_ | New table for time-windowed offers. Different from `brand_events` because specials are recurring (2-for-1 Tuesdays) and have a redemption flow. Schema: id, brand_id, title, description, image_url, starts_at, ends_at, recurrence_rule (RRULE-style), redemption_code, points_required (optional). |

### Renamed terminology in code + UI

A find-and-replace pass across the codebase:

- `fan` → `member`
- `fans` → `members`
- `artist` → `brand`
- `artists` → `brands`
- `community` → `club` (only in user-facing copy; database stays `community_id` for back-compat)
- `Fan Engage` → new product name throughout
- `RaeLynn community` → `[Brand] club`

Database column names mostly stay (less disruptive). UI strings change everywhere.

### New environment

- New Supabase project (separate DB, separate auth, separate storage buckets).
- New Vercel project + domain (separate from Fan Engage).
- New Stripe account or Stripe Connect platform setup.
- Mailchimp can stay one account but use a separate audience.
- Twilio: new messaging service for SMS in this product, especially since 10DLC registration is brand-by-brand.

### Things we keep wholesale

- `useFormSave` retry-on-503 hook.
- `EditableEventRow` admin pattern.
- Multi-tenant model from `0011_multi_tenant.sql`.
- Tier system (bronze/silver/gold/platinum) and points engine.
- Rewards redemption flow (`0021_rewards_redemption.sql`).
- Premium gating + Stripe subscriptions.
- Community composer (post/announcement/poll/challenge).
- Event reminders (24h + 1h cron).

---

## 9. Phased build plan

### Phase 0 — Spec sign-off + naming (Week 1)

- Team review of this doc.
- Pick a name (see Naming).
- Buy domain.
- Decide: same Supabase org or new one (separate org makes billing cleaner).
- Decide: same Vercel team or new project (probably new project under same team).

### Phase 1 — Clone + rename (Weeks 2–3)

- Fork `Superfan-platform` repo to a new repo.
- Run the find-and-replace rename pass (artist → brand, fan → member, etc.) — automated where possible.
- Rename `artists` → `brands`, add the category-specific columns.
- Drop the music-specific seed data (RaeLynn, Danger Twins, etc.).
- Spin up a new Supabase project, apply all migrations clean (including 0023's signup fix from yesterday).
- Spin up new Vercel project on the new domain.
- First build green, fan home loads as "member home," admin loads as "brand admin."

### Phase 2 — MVP feature set (Weeks 4–7)

- Specials manager (the new table + admin form + consumer-side list).
- Brand category-aware fields on the profile editor.
- Self-serve brand onboarding wizard (`/onboarding-brand`).
- Marketplace `/discover` page with filter by category + city.
- Update copy throughout to be category-agnostic ("post a photo," "earn points," etc. instead of music-specific phrases).
- Members list in admin with tier/points sort.
- Stripe pricing tiers for Free / Pro / Premium (Stripe products + checkout).
- Restaurant-tailored starter rewards templates (free appetizer = 50 pts, etc.).

### Phase 3 — Friends-and-family beta (Weeks 8–10)

- Onboard 5 paying restaurants from your network. Charge them $49/mo from day one (it's the only way to know if it's actually worth $49).
- Bug-bash, copy polish, onboarding friction reduction.
- Consumer-side: get 100 members signed up across the 5 brands.
- Iterate fast based on what brands actually use vs ignore.

### Phase 4 — Public freemium launch (Weeks 11–13)

- Open self-serve signup for any brand to claim a free page.
- Marketing landing page, basic SEO, ProductHunt launch.
- Goal: 100 brands signed up, 10 of them on Pro within 30 days of launch.

### Phase 5 — V2 features based on what V1 taught us (Months 4–6)

In rough priority order:

- **POS integration** — Square first (best API), Toast second. Tied points = real loyalty.
- **Multi-location** — chains and small groups need this.
- **SMS broadcasts** — Twilio with 10DLC per-brand registration flow.
- **White-label / custom domain** — Premium-tier feature.
- **Stripe Connect** — so paid memberships route revenue to brands.
- **Cross-brand challenges + sponsored campaigns** — revenue path #2.
- **Native mobile wrappers** — iOS + Android via Capacitor, since the web app is already a PWA-friendly Next.js build.
- **Vertical 2 (retail or sports)** based on which V1 customers pull hardest.

---

## 10. Success metrics

### V1 (90 days post-launch)

- **10 paying brands** at $49+/mo = ~$500 MRR baseline.
- **100 free-tier brands** (engagement signal — even if they don't pay, they validate the wedge).
- **1,000 consumer signups** across all brands.
- **30% MAU/registered ratio** (consumers who logged in within 30 days / total registered).
- **<5% paying-brand churn** in first 90 days.

### Year 1

- **$10K MRR** = ~200 paying brands at $50 average.
- **5,000 active consumer members** earning points monthly.
- **50% of new brand signups complete the onboarding wizard** (vs starting and abandoning).
- **Tier distribution healthy** — at least 20% of members hitting Silver (some engagement, not just signed up).

### Leading indicators to watch weekly

- New brand signups per week (top of funnel).
- % of brands that publish at least 1 post within 7 days of signup (activation).
- % of brands that are still posting in week 4 (retention).
- Consumer signups per active brand (network effects).
- Posts per active brand per week (engagement).

---

## 11. Open questions / decisions needed

1. **Naming.** Doc-end section has options. Need to pick before we register a domain.
2. **Same Supabase org or new one?** New is cleaner (billing, scope, blast radius). Same is faster (one set of credentials to manage).
3. **Same Stripe account or Stripe Connect from day 1?** Day-1 Connect is more work but means we don't migrate later.
4. **Free tier member cap — is 50 the right number?** Could be 100, could be 25. Lower forces conversion sooner; higher attracts more long-tail brands.
5. **Pricing currency strategy** — start USD only or include CAD/EUR/GBP from day 1? Stripe handles multi-currency cleanly.
6. **Verifying brand identity on signup** — anti-spoof. Self-serve means anyone can claim a brand page. Need a verification flow ("send proof of business address" or "verify via Google My Business" or "manual review by us") to avoid impersonation.
7. **Consumer profile uniqueness** — same email signed in to multiple brands' clubs? Yes (the marketplace model is one consumer login → many brands). The fan_community_memberships pattern already handles this.
8. **Data ownership and exit** — if a brand cancels Pro, do they get to export their member list? (Should be yes — common SaaS expectation.) What about consumers — can they delete their data per CCPA/GDPR? (Already partially handled in Fan Engage; need to formalize.)
9. **Content moderation** — when consumers post in a brand's club, who moderates? V1 = brand admin moderates their own. V2 = ML-based pre-flagging. Need T&Cs that make this clear.
10. **Geographic launch** — US-only V1 (10DLC, Stripe US, Twilio US). International is V2.

---

## 12. Naming

Picking a name is one of the few decisions that's hard to reverse later. The product needs to:

- Work across verticals (restaurant + retail + sports + hotel).
- Feel like a club / community / membership thing, not a punch card.
- Be ownable as a `.com` (ideally) or at least a strong alternate TLD.
- Pronounceable for an audience that includes 60-year-old restaurant owners.
- Not collide with existing trademarks.

A few directions to consider, with rationale:

| Direction | Examples | Vibe |
|---|---|---|
| **Insider language** | Insidr, Inner Circle, Inside Track, Insiders Co, Backstage, Greenroom | Plays to "feel like a regular." Risk: feels exclusive in a way that might alienate the long tail. |
| **Loyalty / club** | Clubhaus, Stamp Club, Loyal, The Regulars, House Members | Direct. Tells you what it is. Slight risk of feeling generic. |
| **Community + perks** | Patron, Patrons, Cohort, Founders, Familia | Warm. "Patron" is taken (Patreon, Patron tequila); needs a twist. |
| **Verb / action** | Pulse, Tap, Mingle, Reverb, Engage | Energetic. "Engage" already used in Fan Engage so might be confusing internally. |
| **Coined / abstract** | Membra, Loomly, Crowely, Knotch, Folio | Brandable, harder to evaluate without testing. |
| **Geographic / locality** | Hometown, Mainstreet, Local League, Block, Neighborhood | Plays to the SMB-local angle. |

Three I'd put on a shortlist for you to test:

1. **"Inner Circle"** — strong meaning, premium feel, pluralizes well ("you're an insider at 5 brands"), trademark-checkable. Domain availability TBD.
2. **"Loyal"** — bold, single word, ownable. Probably has TM conflicts but the conceptual clarity is hard to beat.
3. **"Clubhaus"** — neutral across verticals, evokes physical-world community, distinctive. International-friendly.

Wildcards worth a few minutes' thought:

- **"Regulars"** — describes exactly who this is for.
- **"Patron"** — high TM risk but conceptually pure.
- **"Backstage"** — leverages your music heritage for a soft brand bridge from Fan Engage.
- **"The Hub"** — generic but works.

Suggest doing a 30-minute trademark check on the top 3 (USPTO TESS database) and a domain availability sweep, then pick.

---

## 13. Risk + mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Toast / Square clone the community angle** | Medium | They've shown no interest in this for years; their UX paradigm is POS-first. Move fast and own the SMB community-first wedge before they react. |
| **Brands sign up but don't post** (engagement death spiral) | High | Onboarding wizard pushes them to publish their first post during setup. Email nudge at day 3 / day 7 / day 14 if no posts. Templates of what to post for each vertical. |
| **Consumer-side never reaches network effect** | Medium | Free brand pages with QR codes restaurants can put on receipts → low-friction acquisition. Cross-brand discovery in the marketplace creates network value. |
| **Freemium economics break** (free tier too generous, no conversion) | Medium | 50-member cap is the forcing function. Watch conversion rate weekly; tighten cap if needed. |
| **Pricing too high for SMB** | Low | $49 is well below Toast/Punchh/Thanx; Mailchimp Standard is $20 for 500 contacts and brands pay it. |
| **Pricing too low for sustained growth** | Medium | Premium tier at $149 gives upgrade path; SMS metering, Connect cuts, sponsored campaigns are revenue-stacks-on-top. |
| **Brand impersonation / trademark abuse** | Medium | Verification step at signup (proof of business). Takedown flow for trademark holders. |
| **Building four verticals diffuses focus** | High (if not careful) | V1 = restaurants only, full stop. Other verticals only after restaurant economics prove out. |
| **Competing with Fan Engage for engineering attention** | Real | Plan for it: hire / contract dedicated engineering before serious build. Fan Engage is pre-launch and can't afford parallel-track distraction without help. |

---

## 14. Recommendation

**Proceed in three concrete next steps:**

1. **Decide on the name within 1 week.** I'd test "Inner Circle," "Clubhaus," and "Loyal" with 5–10 of your target restaurant owners — text them and ask which one they'd be more likely to sign up for.
2. **Spec walkthrough + sign-off** with the team (Carla, Raymond, Paul, George) once they've read this doc. Capture their challenges and revisions in v2.
3. **Hire or contract one mid-senior full-stack engineer** focused on this product, working from this spec, for the 13-week V1 build. Fan Engage's launch can't share an engineering bench with a parallel build without slipping.

If those three things are squared away, V1 is shippable in 90 days. The architecture work has already been done — Fan Engage is the de-risked starting point. The remaining work is rename, re-skin, add specials + multi-location-deferred, do self-serve brand signup, and find your first 10 paying customers.

The angle is real. Community-first loyalty for SMB brands is a seat that's been open for years. Let's take it.
