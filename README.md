# Brand Engage Pro

Community-driven loyalty platform for brands. Marketplace where consumers discover and join their favorite restaurants, retailers, sports clubs, and hotels — and get rewarded for engagement, not just spend.

V1 lead vertical: **restaurants**.
V1 launch customer: **Nellie's Southern Kitchen** (Belmont, NC).

## What this is

Most loyalty programs are punch cards in disguise. Brand Engage Pro is what an brand member club is to a musician's supermembers, applied to brands: a place where regulars become members, members earn status by engaging (posts, polls, RSVPs, challenges) — not just by spending — and the brand has a real surface to talk to its most loyal customers.

- **Free tier** — brand page, posts, polls, challenges, events with RSVP, manual rewards. 50 active members.
- **Pro tier ($49/mo)** — unlimited members, custom accent colors, premium membership tier, CSV import, weekly broadcast, basic analytics.
- **Premium tier ($149/mo)** — SMS broadcasts, POS integration (Square + Toast), white-label custom domain, advanced analytics, priority support.

See [`docs/STRATEGY_AND_SPEC.md`](docs/STRATEGY_AND_SPEC.md) for the full product strategy.

## Tech stack

- **Next.js 16** (App Router, React Server Components)
- **TypeScript** (strict)
- **Tailwind CSS**
- **Supabase** (Postgres + Auth + Storage)
- **Stripe** (subscriptions, webhooks, Connect for paid memberships)
- **Mailchimp** (email)
- **Twilio** (SMS)
- **Vercel** (hosting + Crons)

## Live URLs

- Public app: TBD (production domain pending)
- GitHub: <https://github.com/KevinJonasSr/brand-engage-pro>
- Supabase: TBD
- Vercel: <https://vercel.com/jonas-group/brand-engage-pro>

## Lineage

Brand Engage Pro is a fork of [Member Engage](https://github.com/KevinJonasSr/Supermember-platform) (the Jonas Group's music member-club platform). The architecture maps onto loyalty almost 1:1 — multi-tenant communities, tiered memberships, points + rewards catalog, social posts, RSVPs, premium gating via Stripe — so we cloned the codebase, dropped the music-specific seed data, and pivoted the vocabulary toward brands and members.

The migration paper trail starts at `0001_init.sql` (inherited from Member Engage) and continues with Brand Engage Pro–specific migrations from `0024_*` onward (brands schema, specials table, brand-locations, etc.).

## Quick start

See [`COLLABORATING.md`](COLLABORATING.md) for full onboarding — access checklist (GitHub, Vercel, Supabase, Stripe), local dev setup, code conventions, and what to read first.

## Status

Pre-launch. Targeting public freemium launch ~13 weeks from initial commit.
