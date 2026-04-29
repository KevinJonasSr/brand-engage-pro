import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listBrands } from "@/lib/brands";
import {
  doesMemberFollowBrand,
  getBrandFromDb,
} from "@/lib/data/brands";
import { getRsvpMetaForEvents } from "@/lib/data/events";
import { listSpecialsForBrand, formatRecurrence } from "@/lib/data/specials";
import { getCurrentMember } from "@/lib/data/member";
import { canAccess, getViewerEntitlement } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import PremiumPaywall from "@/components/premium-paywall";
import SocialIcon from "@/components/social-icon";
import FollowButton from "./follow-button";
import RsvpButton from "./rsvp-button";

export const dynamic = "force-dynamic";

// Per-brand hero focal-y overrides. The default (30%) is biased to keep
// faces visible in portrait brand photos. Restaurants and product shots
// often need a different anchor — Nellie's signage shot is bottom-heavy,
// so anchor at the bottom to keep the sign above the title/CTA overlay.
// Promote to a `hero_focal_y` column on brands when this list grows.
const HERO_FOCAL_Y: Record<string, string> = {
  nellies: "bottom",
};

export async function generateStaticParams() {
  // Static-params still uses the hardcoded list so builds don't need DB creds.
  // Runtime queries the DB and falls back to the same map on error.
  return listBrands().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandFromDb(slug);
  if (!brand) return { title: "Brand · Brand Engage Pro" };
  return {
    title: `${brand.name} · Brand Engage Pro`,
    description: brand.tagline,
  };
}

async function getFounderCount(communitySlug: string): Promise<{ count: number; cap: number } | null> {
  try {
    const admin = createAdminClient();
    const { data: community, error: communityError } = await admin
      .from("communities")
      .select("founder_cap")
      .eq("slug", communitySlug)
      .maybeSingle();
    if (communityError || !community) return null;

    const { count, error: countError } = await admin
      .from("member_community_memberships")
      .select("*", { count: "exact", head: true })
      .eq("community_id", communitySlug)
      .eq("is_founder", true);
    if (countError || count === null) return null;

    return {
      count,
      cap: (community.founder_cap as number) ?? 100,
    };
  } catch {
    return null;
  }
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [brand, member, isFollowing, entitlement, founderData, specials] = await Promise.all([
    getBrandFromDb(slug),
    getCurrentMember(),
    doesMemberFollowBrand(slug),
    getViewerEntitlement(slug),
    getFounderCount(slug),
    listSpecialsForBrand(slug),
  ]);
  if (!brand) notFound();
  const isSignedIn = member !== null;
  const needsProfile = isSignedIn && !member.first_name;

  // RSVP meta: counts + whether the current member has RSVPed to each event.
  // Only events with a real DB id participate; fallback hardcoded events
  // (no id) remain read-only.
  const eventIds = brand.upcoming.filter((e) => !!e.id).map((e) => e.id as string);
  const { counts: rsvpCounts, mine: myRsvps } = await getRsvpMetaForEvents(eventIds);

  const heroGradient = `linear-gradient(to bottom right, ${brand.accentFrom}66, #0f172a, #000000)`;
  const ctaGradient = `linear-gradient(to right, ${brand.accentFrom}, ${brand.accentTo})`;

  // Primary CTA adapts to the viewer's state:
  // - anonymous  → "Join the member club" → /signup?ref=<slug>
  // - signed in, no profile → "Complete profile" → /onboarding?ref=<slug>
  // - signed in, profile done → "Shop drops" → /marketplace
  const primaryCta = !isSignedIn
    ? { label: "Join the member club", href: `/signup?ref=${brand.slug}` }
    : needsProfile
      ? { label: "Complete your profile", href: `/onboarding?ref=${brand.slug}` }
      : { label: "Shop drops", href: "/marketplace" };

  const secondaryCta = isSignedIn
    ? { label: "My rewards", href: "/rewards" }
    : { label: "See merchandise", href: "/marketplace" };

  const showFounderLink = founderData && founderData.cap > 0;

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-12">
      {/* Hero */}
      <section
        className="relative flex flex-col justify-end overflow-hidden rounded-3xl border border-white/10 min-h-[420px] md:min-h-[520px]"
        style={!brand.heroImage ? { backgroundImage: heroGradient } : undefined}
      >
        {brand.heroImage && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brand.heroImage}
              alt=""
              // Bias the focal point to ~30% from the top so portrait brand
              // photos keep the face visible in this wide hero. The default
              // `object-position: center` (50%) crops too low (slices heads
              // off the top); `object-top` (0%) crops too high (shows only
              // sky/background above the subject). 30% lands around the
              // upper-mid of most portrait photos where faces sit. If a
              // specific brand's photo needs different framing, consider
              // adding a per-brand `hero_focal_y` column.
              style={{ objectPosition: `center ${HERO_FOCAL_Y[brand.slug] ?? "30%"}` }}
              className="absolute inset-0 h-full w-full object-cover"
              aria-hidden
            />
            {/* Dark gradient overlay so the title/CTAs stay legible regardless of the photo */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.15) 100%)",
              }}
              aria-hidden
            />
          </>
        )}

        {/* Content layer — sits above image + overlay */}
        <div className="relative p-10">
          <p className="text-xs uppercase tracking-[0.3em] text-white/70">
            {brand.genres.join(" · ")}
          </p>
          <h1
            className="mt-3 text-5xl font-semibold leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {brand.name}
          </h1>
          <p className="mt-3 max-w-xl text-lg text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
            {brand.tagline}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={primaryCta.href}
              className="rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:brightness-110"
              style={{ backgroundImage: ctaGradient }}
            >
              {primaryCta.label}
            </Link>
            {isSignedIn && (
              <FollowButton brandSlug={brand.slug} initialFollowing={isFollowing} />
            )}
            <Link
              href={`/brands/${slug}/community`}
              className="rounded-full border border-white/30 bg-black/30 px-6 py-3 text-sm font-medium text-white/90 backdrop-blur hover:bg-white/10"
            >
              Community →
            </Link>
            <Link
              href={secondaryCta.href}
              className="rounded-full border border-white/30 bg-black/30 px-6 py-3 text-sm font-medium text-white/90 backdrop-blur hover:bg-white/10"
            >
              {secondaryCta.label}
            </Link>
          </div>
          {!brand.heroImage && (
            <p className="mt-6 text-xs text-white/40">
              Hero imagery pending Box asset drop.
            </p>
          )}
        </div>
      </section>

      {/* Founder wall link */}
      {showFounderLink && (
        <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4">
          <Link
            href={`/brands/${slug}/founders`}
            className="inline-flex items-center gap-2 text-sm font-medium text-white/80 hover:text-white transition"
          >
            👑 See the {founderData!.count} Founding Members →
          </Link>
        </section>
      )}

      {/* About */}
      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="glass-card p-8">
          <p className="text-sm uppercase tracking-wide text-white/60">About</p>
          <p className="mt-4 text-base leading-relaxed text-white/80 whitespace-pre-line">{brand.bio}</p>
        </div>
        <div className="glass-card p-8">
          <p className="text-sm uppercase tracking-wide text-white/60">Follow</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {brand.social.length === 0 ? (
              <p className="text-xs text-white/40">Social links pending.</p>
            ) : (
              brand.social.map((s) => (
                <SocialIcon key={s.label} label={s.label} href={s.href} />
              ))
            )}
          </div>
        </div>
      </section>

      {/* Specials — recurring offers a brand publishes to its members */}
      {specials.length > 0 && (
        <section className="glass-card p-8">
          <p className="text-sm uppercase tracking-wide text-white/60">Specials</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {specials.map((s) => {
              const access = canAccess(s.tier, entitlement);
              if (!access.allowed) {
                return (
                  <PremiumPaywall
                    key={s.id}
                    feature={s.title}
                    description="Premium members get access to off-menu specials, member-only pours, and the small-batch stuff we don’t put on the regular menu."
                    communityId={slug}
                    accentFrom={brand.accentFrom}
                    accentTo={brand.accentTo}
                    reason={
                      access.reason === "signed-out"
                        ? "signed-out"
                        : access.reason === "needs-founder"
                          ? "needs-founder"
                          : "needs-premium"
                    }
                    compact
                  />
                );
              }
              const cadence = formatRecurrence(s);
              return (
                <div key={s.id} className="rounded-2xl bg-black/30 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{s.title}</p>
                      {s.description && (
                        <p className="mt-1 text-xs leading-relaxed text-white/70">
                          {s.description}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                        {cadence && (
                          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 uppercase tracking-wide text-white/70">
                            {cadence}
                          </span>
                        )}
                        {s.tier !== "public" && (
                          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 uppercase tracking-wide text-amber-200">
                            {s.tier === "founder-only" ? "Founders" : "Premium"}
                          </span>
                        )}
                        {s.points_required && s.points_required > 0 ? (
                          <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 uppercase tracking-wide text-emerald-200">
                            {s.points_required.toLocaleString()} pts
                          </span>
                        ) : null}
                      </div>
                      {s.redemption_code && (
                        <p className="mt-3 text-[11px] text-white/50">
                          Show code{" "}
                          <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-white/90">
                            {s.redemption_code}
                          </code>{" "}
                          at the register.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Upcoming */}
      <section className="glass-card p-8">
        <p className="text-sm uppercase tracking-wide text-white/60">Upcoming</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {brand.upcoming.map((e) => {
            // Phase 5d: gate premium-tier events. Fallback events (no id)
            // have no DB tier; treat as public.
            const eventTier = e.tier ?? "public";
            const access = canAccess(eventTier, entitlement);
            if (!access.allowed) {
              return (
                <PremiumPaywall
                  key={e.id ?? e.title}
                  feature={e.title}
                  description="Premium members get access to intimate listening parties, early RSVPs, and backstage-only moments."
                  communityId={slug}
                  accentFrom={brand.accentFrom}
                  accentTo={brand.accentTo}
                  reason={
                    access.reason === "signed-out"
                      ? "signed-out"
                      : access.reason === "needs-founder"
                        ? "needs-founder"
                        : "needs-premium"
                  }
                  compact
                />
              );
            }
            const eventId = e.id ?? null;
            const count = eventId ? rsvpCounts.get(eventId) ?? 0 : 0;
            const atCapacity =
              e.capacity != null && e.capacity > 0 && count >= e.capacity;
            const rsvped = eventId ? myRsvps.has(eventId) : false;
            return (
              <div
                key={eventId ?? e.title}
                className="rounded-2xl bg-black/30 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{e.title}</p>
                    <p className="text-xs text-white/60">{e.detail}</p>
                    {e.location && (
                      <p className="mt-1 text-xs text-white/60">📍 {e.location}</p>
                    )}
                    <p className="mt-3 text-xs uppercase tracking-wide text-white/40">
                      {e.date}
                    </p>
                    {eventId && (
                      <p className="mt-1 text-[11px] text-white/50">
                        {count}
                        {e.capacity ? ` / ${e.capacity}` : ""} RSVPed
                      </p>
                    )}
                  </div>
                  {eventId && isSignedIn && (
                    <RsvpButton
                      eventId={eventId}
                      brandSlug={brand.slug}
                      initialRsvped={rsvped}
                      atCapacity={atCapacity}
                    />
                  )}
                </div>
                {eventId && (
                  <div className="mt-3 flex items-center gap-3 text-[11px]">
                    <a
                      href={`/api/events/${eventId}/ics`}
                      className="text-white/60 hover:text-white"
                    >
                      📅 Add to calendar
                    </a>
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-white/60 hover:text-white"
                      >
                        Details ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Merch */}
      <section className="glass-card p-8">
        <p className="text-sm uppercase tracking-wide text-white/60">Member club rewards</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {brand.merch.map((m) => (
            <div key={m.title} className="rounded-2xl bg-black/30 p-5">
              <p className="text-xs uppercase tracking-wide text-white/50">{m.tier}</p>
              <p className="mt-1 text-sm font-semibold">{m.title}</p>
              <p className="mt-3 text-sm font-semibold text-emerald-300">{m.points}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
