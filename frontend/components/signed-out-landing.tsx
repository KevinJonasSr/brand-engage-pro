import Link from "next/link";
import type { Brand } from "@/lib/brands";
import type { ReactNode } from "react";

/* ── Icon set (Lucide-style, 24×24, 1.5px stroke) ─────────────────────── */
function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconZap() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
function IconGift() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}
function IconTrophy() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </svg>
  );
}
function IconMessage() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconBadge({ icon }: { icon: ReactNode }) {
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-aurora/20 to-ember/10 text-aurora">
      {icon}
    </span>
  );
}

/**
 * Public-facing marketing landing rendered at `/` for signed-out visitors.
 *
 * Structured like the funnel we actually want: big hero with a single primary
 * CTA, then progressive disclosure (how-it-works → feature pillars → featured
 * brands → closing CTA). Signed-in members never see this — they hit the
 * personalized Member Home dashboard from Phase 3e instead.
 */
export default function SignedOutLanding({ brands }: { brands: Brand[] }) {
  const featured = brands.slice(0, 5);

  return (
    <main className="overflow-hidden">
      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative border-b border-white/5">
        {/* Soft aurora glow behind the hero */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="absolute -top-24 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-br from-aurora/40 via-ember/20 to-transparent blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-6xl gap-10 px-6 pt-12 pb-20 lg:grid-cols-[1.15fr_1fr] lg:pt-16 lg:pb-28">
          <div className="flex flex-col justify-center">
            <p className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-white/70">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              The member-loyalty platform
            </p>
            <h1
              className="text-5xl font-semibold leading-[1.05] md:text-6xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Skip the line. Earn the perks.
              <br />
              <span className="bg-gradient-to-r from-aurora via-amber-400 to-ember bg-clip-text text-transparent">
                Become a regular.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/70">
              Follow the brands you love, earn points for every visit and
              check-in, and unlock real perks — member specials, dining rewards,
              and first access casual customers never get.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup?next=/onboarding"
                className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
              >
                Create your member profile →
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-white/20 px-5 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-xs text-white/50">
              Free · 60 seconds · No credit card
            </p>
            <p className="mt-2 text-xs font-medium text-aurora">
              Join free and unlock your first member perk today.
            </p>
          </div>

          {/* Honest start state — no fake points / Gold theater */}
          <div className="lg:hidden mt-8 rounded-3xl border border-white/10 bg-gradient-to-br from-aurora/40 via-slate-900 to-black p-6 shadow-glass">
            <p className="text-xs uppercase tracking-widest text-white/60">Your member start</p>
            <p className="mt-4 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>0</p>
            <p className="text-xs text-white/50">points until you join</p>
            <ul className="mt-4 space-y-2 text-xs text-white/70">
              <li className="rounded-xl bg-black/30 px-3 py-2">+100 welcome points after you finish your profile</li>
              <li className="rounded-xl bg-black/30 px-3 py-2">+25 pts per daily check-in visit</li>
              <li className="rounded-xl bg-black/30 px-3 py-2">Redeem food & drink rewards at the brand</li>
            </ul>
          </div>

          <div className="relative hidden lg:block">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative h-[440px] w-[360px]">
                <div className="absolute left-8 top-12 h-[380px] w-[320px] rotate-3 rounded-3xl border border-white/10 bg-gradient-to-br from-ember/25 via-slate-900 to-aurora/25 shadow-glass">
                  <div className="p-6 text-white/70">
                    <p className="text-xs uppercase tracking-widest">How members earn</p>
                    <p className="mt-2 text-sm font-semibold text-white">Visits · check-ins · community</p>
                    <p className="mt-1 text-xs text-white/60">
                      Real points only — no demo balances
                    </p>
                  </div>
                </div>
                <div className="absolute left-0 top-0 h-[380px] w-[320px] -rotate-2 rounded-3xl border border-white/10 bg-gradient-to-br from-aurora/40 via-slate-900 to-black p-6 shadow-glass">
                  <p className="text-xs uppercase tracking-widest text-white/60">
                    Sign up to start at 0
                  </p>
                  <p
                    className="mt-6 text-4xl font-semibold text-white"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    0
                  </p>
                  <p className="text-xs text-white/50">total points (before you join)</p>
                  <div className="mt-6 space-y-2 text-xs text-white/80">
                    <div className="rounded-xl bg-black/30 px-3 py-2">
                      Finish profile → <span className="text-emerald-300">+100 welcome pts</span>
                    </div>
                    <div className="rounded-xl bg-black/30 px-3 py-2">
                      Daily check-in → <span className="text-emerald-300">+25 pts</span>
                    </div>
                    <div className="rounded-xl bg-black/30 px-3 py-2">
                      Redeem on the brand rewards page
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── How it works ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-xs uppercase tracking-widest text-white/50">
          How it works
        </p>
        <h2
          className="mt-2 max-w-2xl text-3xl font-semibold md:text-4xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Three steps from casual visitor to regular.
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            {
              n: "01",
              title: "Follow your brands",
              body: "Pick the brands you love. You'll get their drops, events, polls, and challenges in one feed.",
              icon: <IconUsers />,
            },
            {
              n: "02",
              title: "Earn points for every visit",
              body: "Showing up to events, RSVPing, voting in polls, commenting, sharing your referral code — all of it earns points.",
              icon: <IconZap />,
            },
            {
              n: "03",
              title: "Redeem what’s actually stocked",
              body: "Points cash in for live brand rewards. Nellie's Jackie launch: dessert on join, 1,500 pts after 3 visits, birthday entrée. We don’t market empty Gold/Platinum SKUs.",
              icon: <IconGift />,
            },
          ].map((step) => (
            <div
              key={step.n}
              className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-6"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-white/40">
                  {step.n}
                </span>
                <IconBadge icon={step.icon} />
              </div>
              <h3 className="mt-6 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-white/65">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Feature pillars ──────────────────────────────────────────────── */}
      <section className="border-y border-white/5 bg-black/20">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-widest text-white/50">
                What you get
              </p>
              <h2
                className="mt-2 text-3xl font-semibold md:text-4xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                More than a mailing list.
                <br />
                A real member club.
              </h2>
              <p className="mt-6 max-w-md text-white/70">
                Everything in one place — events, community, rewards, and the
                stuff casual customers never see.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                {
                  title: "Tier Journey",
                  body: "Bronze → Platinum from points. Founding = first 100. Premium ≈ Gold+ on gated specials.",
                  icon: <IconTrophy />,
                },
                {
                  title: "Community Hub",
                  body: "Posts, polls, challenges — per brand, moderated, never spam.",
                  icon: <IconMessage />,
                },
                {
                  title: "Member Events",
                  body: "Capacity-limited tastings, previews, meet-ups. Reminders included.",
                  icon: <IconCalendar />,
                },
                {
                  title: "Stocked rewards",
                  body: "Jackie launch: free dessert with entrée on join, 1,500 pts after 3 visits, birthday entrée up to $30. New accounts start at 0 — no empty Gold/Platinum catalog.",
                  icon: <IconGift />,
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="rounded-2xl border border-white/10 bg-black/30 p-5"
                >
                  <IconBadge icon={f.icon} />
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-1 text-xs text-white/60">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Featured brands ─────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-white/50">
                Featured brands
              </p>
              <h2
                className="mt-2 text-3xl font-semibold md:text-4xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Already on Brand Engage Pro.
              </h2>
            </div>
            <Link
              href="/brands"
              className="hidden items-center gap-1 text-sm font-medium text-white/70 hover:text-white sm:inline-flex"
            >
              See all →
            </Link>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {featured.map((a) => (
              <Link
                key={a.slug}
                href={`/brands/${a.slug}`}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-5 transition hover:border-white/25 hover:bg-white/5"
              >
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-80"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${a.accentFrom}, ${a.accentTo})`,
                  }}
                />
                <p className="mt-2 text-base font-semibold">{a.name}</p>
                {a.tagline && (
                  <p className="mt-1 text-xs text-white/55 line-clamp-2">
                    {a.tagline}
                  </p>
                )}
                <p className="mt-4 text-xs text-white/50 transition group-hover:text-white/80">
                  Visit page →
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ─── Closing CTA ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-aurora/25 via-slate-900 to-ember/25 p-10 text-center shadow-glass md:p-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_circle_at_50%_-20%,rgba(212,160,23,0.35),transparent)]"
          />
          <p className="relative text-xs uppercase tracking-widest text-white/60">
            Ready for +100 welcome points?
          </p>
          <h2
            className="relative mt-3 text-3xl font-semibold md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Join free in under a minute.
          </h2>
          <p className="relative mt-4 text-white/70">
            Create your account, finish your member profile, and earn{" "}
            <span className="text-white">+100 welcome points</span>. Then check
            in on visits for +25 pts and redeem brand rewards.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup?next=/onboarding"
              className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
            >
              Create member profile →
            </Link>
            <Link
              href="/brands"
              className="rounded-full border border-white/25 px-5 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
            >
              Browse brands
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
