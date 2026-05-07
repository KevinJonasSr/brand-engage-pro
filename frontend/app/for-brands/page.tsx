import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For Brands · Brand Engage Pro",
  description:
    "Launch a member club on Brand Engage Pro. Reward your regulars, run member-only specials, fulfill perks, and turn customer activity into a community — without renting attention from social platforms.",
  alternates: { canonical: "/for-brands" },
  openGraph: {
    type: "website",
    url: "/for-brands",
    siteName: "Brand Engage Pro",
    title: "Loyalty that actually rewards your regulars",
    description:
      "Brand Engage Pro is a member-club platform for restaurants, retailers, and entertainment companies. Direct member relationships, real perks, specials, and predictions — built for operators.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Loyalty that actually rewards your regulars · Brand Engage Pro",
    description:
      "Direct member relationships, real perks, specials, predictions, and a weekly admin brief — built for restaurants, retailers, and entertainment companies.",
  },
};

/**
 * Public brand-acquisition landing page.
 *
 * Refreshed 2026-05-06 to mirror the FE /for-artists Tier B audit:
 *   - Stronger benefit-led hero copy
 *   - Proof / "what's already live" section
 *   - Featured brands strip (real cards linking to live hubs)
 *   - "What you can launch" 6-card grid
 *   - Data ownership section (safer interim copy until legal lands)
 *   - Expanded "how launch works" 4-step walkthrough
 *   - 7-question FAQ targeting operator + manager objections
 *   - Closing CTA reinforces application action
 *   - "Already approved? Sign in →" breadcrumb in hero
 *
 * Preserves the existing dark premium aesthetic and component
 * primitives. Deliberately does not invent legal terms, pricing, or
 * performance metrics — uses qualitative proof and "confirmed in
 * onboarding" language until the Brand Agreement is finalized.
 */
export default function ForBrandsPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-20 px-6 py-16">
      {/* ─── Hero ──────────────────────────────────────────────────────────── */}
      <section className="space-y-6 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          For Brands
        </p>
        <h1
          className="text-5xl font-semibold leading-[1.05] md:text-6xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Loyalty that actually rewards your{" "}
          <span className="bg-gradient-to-r from-aurora via-fuchsia-400 to-ember bg-clip-text text-transparent">
            regulars
          </span>
          .
        </h1>
        <p className="mx-auto max-w-2xl text-base text-white/75 md:text-lg">
          Brand Engage Pro helps restaurants, retailers, and entertainment
          companies build direct member relationships, reward real engagement,
          and turn customer activity into specials, RSVPs, referrals, and
          community moments — without renting attention from social platforms.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          <Link
            href="/for-brands/apply"
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
          >
            Apply to launch your member club →
          </Link>
          <Link
            href="/brands"
            className="rounded-full border border-white/30 px-6 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
          >
            See active brands
          </Link>
        </div>
        <p className="pt-2 text-xs text-white/50">
          No payment or contract required to apply. We respond within 48 hours.
        </p>
        <p className="text-xs text-white/45">
          Already approved?{" "}
          <Link
            href="/login"
            className="text-white/80 underline-offset-4 hover:underline"
          >
            Sign in to your admin →
          </Link>
        </p>
      </section>

      {/* ─── Proof: what's already live ────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">
            Already live on Brand Engage Pro
          </p>
          <h2
            className="mt-2 text-3xl font-semibold md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Built for real brand communities.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-white/70">
            Each brand gets a member club where regulars follow, earn perks,
            unlock specials, RSVP to events, and stay close to what&apos;s
            happening next. Browse the active clubs to see what your hub could
            look like.
          </p>
        </div>
        <div className="flex justify-center pt-4">
          <Link
            href="/brands"
            className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-medium text-white/85 hover:bg-white/10"
          >
            Browse all member clubs →
          </Link>
        </div>
      </section>

      {/* ─── Featured brands (real proof) ─────────────────────────────────── */}
      <section className="space-y-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">
            Featured brands
          </p>
          <h2
            className="mt-2 text-3xl font-semibold md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Real member clubs, real brands.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-white/70">
            A handful of the brands who built their member club on Brand Engage
            Pro. Click through to see what their hub actually looks like.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              slug: "nellies",
              name: "Nellie's Southern Kitchen",
              tagline:
                "Comfort food + tier perks for the regulars who keep coming back.",
              accent: "#fbbf24",
            },
            {
              slug: "raelynn",
              name: "RaeLynn",
              tagline:
                "Country, heart-first. On tour with Luke Bryan — members get first listen.",
              accent: "#fde68a",
            },
            {
              slug: "jonas-group-ent",
              name: "Jonas Group Entertainment",
              tagline:
                "Entertainment company. Member access to the talent ecosystem.",
              accent: "#a78bfa",
            },
          ].map((b) => (
            <Link
              key={b.slug}
              href={`/brands/${b.slug}`}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-5 transition hover:border-white/25 hover:bg-white/5"
            >
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-1"
                style={{ backgroundColor: b.accent }}
              />
              <p className="mt-2 text-base font-semibold">{b.name}</p>
              <p className="mt-2 text-xs text-white/60 line-clamp-3">
                {b.tagline}
              </p>
              <p className="mt-4 text-xs text-white/55 transition group-hover:text-white/85">
                See their member club →
              </p>
            </Link>
          ))}
        </div>
        {/* TODO(kevin): when we have real testimonial quotes from these
            brands or their teams, replace the tagline strings above
            with pull-quotes. Keep slugs + names so the cards still link
            through to /brands/<slug>. */}
      </section>

      {/* ─── What brands can launch ────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">
            What you can launch
          </p>
          <h2
            className="mt-2 text-3xl font-semibold md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Tools your members actually want to use.
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Specials & founder tiers",
              body: "Limited-time specials, members-only events, founder-only experiences. Cap your founders at 100 and let the rest stack perks toward the next tier.",
            },
            {
              title: "AI-drafted replies",
              body: "Members comment, your team replies at scale. Claude drafts your tone-perfect response — keep it, edit it, send it.",
            },
            {
              title: "Rewards & redemptions",
              body: "Tiered point system, founder-only perks, and a redemption queue your team can fulfill from /admin in two clicks.",
            },
            {
              title: "Weekly member digest",
              body: "Every member gets a personalized weekly recap — perks earned, specials unlocked, what's coming next. Goes straight to their inbox.",
            },
            {
              title: "Referrals & predictions",
              body: "Members invite friends for a perks bounty. Predictions and polls earn perks and create reasons to come back.",
            },
            {
              title: "Weekly admin brief",
              body: "Every Monday morning: top members, redemption velocity, anomaly flags. Lands in Slack and at /admin/briefs.",
            },
          ].map((card) => (
            <div key={card.title} className="glass-card rounded-2xl p-6">
              <p className="text-sm font-semibold">{card.title}</p>
              <p className="mt-2 text-xs text-white/65">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Data ownership ────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-aurora/15 via-black to-ember/15 p-10">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          Your audience, your relationship
        </p>
        <h2
          className="mt-3 text-3xl font-semibold md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          The members you build here stay yours.
        </h2>
        <p className="mt-5 max-w-3xl text-sm text-white/75">
          Brand Engage Pro is built so brands strengthen direct member
          relationships instead of renting attention from social platforms. You
          can see your regulars, you can talk to them, and the contact data
          they share with you doesn&apos;t live behind someone else&apos;s
          ranking algorithm.
        </p>
        <p className="mt-4 max-w-3xl text-xs text-white/55">
          Final data access, export, and permission terms are confirmed during
          onboarding and reflected in the brand agreement. We&apos;ll walk
          through what you can pull, what members control, and how email and
          SMS opt-in works before you go live.
        </p>
      </section>

      {/* ─── How launch works ──────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-500/10 via-black to-aurora/10 p-10 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          How launch works
        </p>
        <h2
          className="mt-3 text-3xl font-semibold md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Four steps from application to live.
        </h2>
        <ol className="mx-auto mt-8 grid max-w-4xl gap-4 text-left text-sm text-white/80 md:grid-cols-4">
          {[
            {
              n: "1. Apply",
              body: "Tell us about your brand, your regulars, and what you want a member club to look like.",
            },
            {
              n: "2. Review",
              body: "We respond within 48 hours. If you're a fit we'll schedule a call with your team.",
            },
            {
              n: "3. Build",
              body: "Guided setup wizard: hero image, first special, first community post, connect your tools.",
            },
            {
              n: "4. Launch",
              body: "Flip your hub live, invite your first founders, and watch the perks start flowing.",
            },
          ].map((step) => (
            <li key={step.n} className="rounded-2xl bg-white/5 p-5">
              <span className="text-xs uppercase tracking-wide text-aurora">
                {step.n}
              </span>
              <p className="mt-2 font-medium">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ─── FAQ ───────────────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/60">
            FAQ
          </p>
          <h2
            className="mt-2 text-3xl font-semibold md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Operator-grade questions, answered.
          </h2>
        </div>
        <div className="space-y-3">
          {[
            {
              q: "What does Brand Engage Pro help brands do?",
              a: "Build a branded member club where regulars follow, earn perks, unlock specials, RSVP to events, refer friends, and stay close. You get direct member relationships, real engagement signal, and tools that turn casual customers into people who actually show up.",
            },
            {
              q: "How long does launch take?",
              a: "Most brands go from approved application to live hub in two to four weeks, depending on assets ready (hero image, bio, first special or perk). Our team confirms a realistic timeline during the onboarding call.",
            },
            {
              q: "Do brands own their member data?",
              a: "Direct member relationships stay with the brand. Final data access, export, and permission specifics are confirmed in the brand agreement at onboarding so you and your team can review before signing anything.",
            },
            {
              q: "What does it cost?",
              a: "Pricing is reviewed with the brand team during onboarding so it can be matched to your member base size and goals. There's no payment or contract required to apply.",
            },
            {
              q: "Can managers, agencies, or brand teams apply?",
              a: "Yes. The application asks for the brand's name and a primary contact — that contact can be the brand owner, an operations lead, or someone on an agency team. We loop in everyone who needs to sign off during the review call.",
            },
            {
              q: "Can we start with a small beta or founder group?",
              a: "Yes — the founder tier is capped at 100 and is designed for that. Most brands start with founders only and open the rest of the experience after the first special or event.",
            },
            {
              q: "Who fulfills perks and physical specials?",
              a: "Depends on the perk. Digital perks (early access, exclusive content, leaderboard placement) are handled by the platform. Physical specials are usually fulfilled by the brand's existing operations — we plug into the workflow you already have.",
            },
          ].map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-white/10 bg-black/30 p-5 transition hover:border-white/25"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium text-white/90 marker:hidden">
                <span>{item.q}</span>
                <span className="text-aurora transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm text-white/70">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ─── Closing CTA ───────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-aurora/25 via-slate-900 to-ember/25 p-10 text-center md:p-16">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          Ready when you are
        </p>
        <h2
          className="mt-3 text-3xl font-semibold md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Let&apos;s build your member club.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-white/75">
          Apply free in under five minutes. We respond within 48 hours and walk
          you through a launch plan that fits your team.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/for-brands/apply"
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
          >
            Apply to launch your member club →
          </Link>
          <Link
            href="/brands"
            className="rounded-full border border-white/25 px-5 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
          >
            See active brands
          </Link>
        </div>
      </section>
    </main>
  );
}
