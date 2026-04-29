import Link from "next/link";

export const metadata = {
  title: "For Brands · Brand Engage Pro",
  description:
    "Loyalty that actually rewards your regulars. Apply to bring your brand to Brand Engage Pro.",
};

export default function ForBrandsPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-16 px-6 py-16">
      <section className="space-y-6 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          For Brands
        </p>
        <h1
          className="text-5xl font-semibold leading-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Loyalty that actually rewards your regulars.
        </h1>
        <p className="mx-auto max-w-2xl text-base text-white/75">
          Brand Engage Pro is a member club platform for restaurants, retailers,
          and entertainment companies that want to turn customers into a
          community — with rewards, exclusive drops, AI-drafted replies, and a
          weekly insights brief that lands in your inbox every Monday.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          <Link
            href="/for-brands/apply"
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
          >
            Apply to join →
          </Link>
          <Link
            href="/brands"
            className="rounded-full border border-white/30 px-6 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
          >
            See active brands
          </Link>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {[
          {
            title: "Rewards & redemptions",
            body: "Tiered point system, founder-only perks, and a redemption queue your team can fulfill from /admin in two clicks.",
          },
          {
            title: "AI-drafted replies",
            body: "Members comment, you reply at scale. Claude drafts your team's tone-perfect response from a single prompt.",
          },
          {
            title: "Weekly admin brief",
            body: "Every Monday morning: top members, redemption velocity, anomaly flags. Lands in Slack and at /admin/briefs.",
          },
        ].map((card) => (
          <div
            key={card.title}
            className="glass-card rounded-2xl p-6"
          >
            <p className="text-sm font-semibold">{card.title}</p>
            <p className="mt-2 text-xs text-white/65">{card.body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-amber-500/15 via-black to-aurora/15 p-10 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          The Process
        </p>
        <h2
          className="mt-3 text-3xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Three steps from application to live brand
        </h2>
        <ol className="mx-auto mt-8 grid max-w-3xl gap-4 text-left text-sm text-white/80 md:grid-cols-3">
          <li className="rounded-2xl bg-white/5 p-5">
            <span className="text-xs uppercase tracking-wide text-aurora">
              1. Apply
            </span>
            <p className="mt-2 font-medium">
              Tell us about your brand, your community, and what you want
              loyalty to look like.
            </p>
          </li>
          <li className="rounded-2xl bg-white/5 p-5">
            <span className="text-xs uppercase tracking-wide text-aurora">
              2. Review
            </span>
            <p className="mt-2 font-medium">
              We respond within 48 hours. If you're a fit, we&apos;ll set up a
              call to align on launch.
            </p>
          </li>
          <li className="rounded-2xl bg-white/5 p-5">
            <span className="text-xs uppercase tracking-wide text-aurora">
              3. Onboard
            </span>
            <p className="mt-2 font-medium">
              Guided setup wizard: hero image, first reward, first post,
              connect your tools, go live.
            </p>
          </li>
        </ol>
        <div className="mt-10">
          <Link
            href="/for-brands/apply"
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
          >
            Apply to join →
          </Link>
        </div>
      </section>
    </main>
  );
}
