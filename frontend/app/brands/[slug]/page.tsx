import Image from "next/image";
import Link from "next/link";
import LeaderboardMiniCard from "@/components/leaderboard-mini-card";
import { LatestStrip } from "@/components/latest-strip";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listBrands } from "@/lib/brands";
import { brandHeroBackground, resolveBrandAccent } from "@/lib/brand-accent";
import {
  doesMemberFollowBrand,
  getBrandFromDb,
} from "@/lib/data/brands";
import { getRsvpMetaForEvents } from "@/lib/data/events";
import { listSpecialsForBrand, formatRecurrence } from "@/lib/data/specials";
import { getCurrentMember } from "@/lib/data/member";
import { canAccess, getViewerEntitlement } from "@/lib/entitlements";
import PremiumPaywall from "@/components/premium-paywall";
import DropCountdown from "@/components/drop-countdown";
import SocialIcon from "@/components/social-icon";
import FollowButton from "./follow-button";
import ShareButton from "@/components/share-button";
import RsvpButton from "./rsvp-button";
import { focalPointStyle } from "@/lib/images/focal-point";
import { MOBILE_HERO_MEDIA, mobileHeroFor } from "@/lib/images/mobile-hero";

import { BrandPredictionsSection } from "@/components/predictions/brand-predictions-section";
import ActivityPulseStrip from "@/components/activity-pulse";
import { getActivityPulse } from "@/lib/data/activity-pulse";
import StampCard from "@/components/stamp-card";
import { getStampCardData } from "@/lib/data/stamp-card";
import { getActiveGoalsWithProgress } from "@/lib/goals/progress";
import { resolveBrandSlug } from "@/lib/brand-aliases";
import { getFoundingClaims } from "@/lib/founding";
import { JGE_BRAND_SLUG } from "@/lib/jge-launch";
import { NELLIES_BRAND_SLUG } from "@/lib/nellies-launch";
import Reveal from "@/components/reveal";

const NELLIES_PHOTOS = [
  {
    src: "/brands/nellies/biscuits.jpg",
    alt: "Biscuits from the Nellie's kitchen",
    caption: "Biscuits from the Nellie's kitchen.",
  },
  {
    src: "/brands/nellies/interior-bar.jpg",
    alt: "The bar at Nellie's Southern Kitchen",
    caption: "The bar at Nellie's.",
  },
] as const;
export const dynamic = "force-dynamic";

// Per-brand hero focal-point now comes from brands.hero_focal_x /
// .hero_focal_y (migration 0034), exposed on Brand via heroFocalX /
// heroFocalY. focalPointStyle() falls back to 50/50 when not set.

export async function generateStaticParams() {
  // Static-params still uses the hardcoded list so builds don't need DB creds.
  // Runtime queries the DB and falls back to the same map on error.
  return listBrands().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = resolveBrandSlug(rawSlug);
  const brand = await getBrandFromDb(slug);
  if (!brand) return { title: "Brand" };
  return {
    title: `${brand.name}`,
    description: brand.tagline,
  };
}

async function getFounderCount(communitySlug: string): Promise<{ count: number; cap: number } | null> {
  try {
    const claims = await getFoundingClaims(communitySlug);
    return { count: claims.claimed, cap: claims.cap };
  } catch {
    return null;
  }
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = resolveBrandSlug(rawSlug);
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
  const isNellies = slug.toLowerCase() === NELLIES_BRAND_SLUG;
  // Nellie's: listSpecialsForBrand puts active member offers first.
  // The 1,500 card is omitted while its catalog reward is inactive.
  const guestSpecials = specials;

  // Fetch activity pulse + stamp card in parallel (non-blocking — both fail gracefully)
  const [pulse, stampCardData, eventIds, goals] = await Promise.all([
    getActivityPulse(slug).catch(() => null),
    member ? getStampCardData(slug, member.id).catch(() => null) : Promise.resolve(null),
    Promise.resolve(brand.upcoming.filter((e) => !!e.id).map((e) => e.id as string)),
    getActiveGoalsWithProgress(slug),
  ]);

  // RSVP meta: counts + whether the current member has RSVPed to each event.
  const { counts: rsvpCounts, mine: myRsvps } = await getRsvpMetaForEvents(eventIds);

  const palette = resolveBrandAccent(brand.accentFrom, brand.accentTo);
  const heroBackground = brandHeroBackground(palette);

  // Brand-type-aware premium paywall copy. Restaurants get food and drink
  // language; everything else gets plain member-club copy.
  const isRestaurant = brand.genres.some((g) =>
    ["Restaurants", "Hospitality", "Southern", "Soul food", "Family-style"].includes(g),
  );
  const premiumDescriptionForBrand = {
    specials: isRestaurant
      ? "Select members get off-menu specials, member-only pours, and small-batch dishes we don\u2019t put on the regular menu."
      : "Select members get member-only perks and first access to new offers.",
    events: isRestaurant
      ? "Select members get small member events, early RSVPs, and behind-the-scenes moments."
      : slug === JGE_BRAND_SLUG
        ? "Select members get the Music Row house tour, early listens from our writers and artists, and a limited number of live sessions."
        : "Select members get member-only events, early RSVPs, and behind-the-scenes moments.",
  };

  // Primary CTA adapts to the viewer's state:
  // - anonymous  → "Join the member club" → /signup?ref=<slug>
  // - signed in, no profile → "Complete profile" → /onboarding?ref=<slug>
  // - signed in, profile done → brand rewards (restaurant loyalty, not marketplace drops)
  const primaryCta = !isSignedIn
    ? { label: "Join the member club", href: `/signup?ref=${brand.slug}` }
    : needsProfile
      ? { label: "Complete your profile", href: `/onboarding?ref=${brand.slug}` }
      : { label: "View rewards", href: `/brands/${brand.slug}/rewards` };

  const showFounderLink = founderData && founderData.cap > 0;
  const mobileHero = mobileHeroFor(brand.heroImage);

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-12">
      {/* Hero */}
      <section
        className="group relative flex flex-col justify-end overflow-hidden rounded-lg border border-iron/10 min-h-[420px] md:min-h-[520px]"
        style={!brand.heroImage ? { backgroundImage: heroBackground } : undefined}
      >
        {brand.heroImage && (
          <>
            {/* Phones get a plain version when the hero has a painted-in wordmark. */}
            <picture>
              {mobileHero && <source media={MOBILE_HERO_MEDIA} srcSet={mobileHero} />}
              <img
                src={brand.heroImage}
                alt=""
                // Focal point comes from brands.hero_focal_x / .hero_focal_y.
                // Default 50/50 (centered) when not set. Tweak via Supabase
                // SQL editor or (Phase 2) the admin focal-point picker.
                style={focalPointStyle(brand)}
                className="absolute inset-0 h-full w-full object-cover bep-photo-zoom"
                aria-hidden
              />
            </picture>
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
          <p className="text-xs uppercase tracking-[0.3em] text-linen/70">
            {brand.genres.slice(0, 2).join(" · ")}{brand.genres.length > 2 ? " +" + (brand.genres.length - 2) : ""}
          </p>
          <h1
            className="mt-3 text-5xl font-semibold text-linen leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {brand.name}
          </h1>
          <p className="mt-3 max-w-xl text-lg text-linen/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
            {brand.tagline}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href={primaryCta.href}
              className="rounded-full px-6 py-3 text-sm font-semibold transition hover:brightness-110 bep-press"
              style={{ backgroundColor: palette.accent, color: palette.onAccent }}
            >
              {primaryCta.label}
            </Link>
            <Link
              href={`/brands/${slug}/community`}
              className="rounded-full border border-linen/30 bg-iron/30 px-6 py-3 text-sm font-medium text-linen/90 backdrop-blur hover:bg-linen/10 bep-press"
            >
              Community →
            </Link>
            {isSignedIn && (
              <FollowButton brandSlug={brand.slug} initialFollowing={isFollowing} />
            )}
            <ShareButton
              title={`${brand.name}`}
              text={`Check out ${brand.name} — ${brand.tagline}`}
              url={
                typeof process.env.NEXT_PUBLIC_APP_URL === "string"
                  ? `${process.env.NEXT_PUBLIC_APP_URL}/brands/${brand.slug}`
                  : `https://brand-engage-pro.vercel.app/brands/${brand.slug}`
              }
              variant="photo"
              label=""
            />
          </div>
          {!isSignedIn && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-aurora/30 bg-iron/40 px-3 py-1 text-xs font-medium text-aurora backdrop-blur">
              🎁 Join free — finish your profile for +100 welcome points.
            </p>
          )}
        </div>
      </section>

      {/* Founder wall link */}
      <Reveal>
      <section className="rounded-lg border border-iron/10 bg-iron/5 backdrop-blur p-4">
        <p className="text-xs uppercase tracking-wide text-iron/70">
          Optional upgrades
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {showFounderLink ? (
            <Link
              href={`/brands/${brand.slug}/founders`}
              className="inline-flex items-center gap-2 font-medium text-iron/80 transition hover:text-iron"
            >
              👑 {(founderData?.count ?? 0) === 0
                ? "Be one of the first 100 Founding Members"
                : `See the ${founderData!.count} Founding ${founderData!.count === 1 ? "Member" : "Members"}`}{" "}→
            </Link>
          ) : (
            <Link
              href={`/brands/${brand.slug}/founders`}
              className="inline-flex items-center gap-2 font-medium text-iron/80 transition hover:text-iron"
            >
              Founding Members →
            </Link>
          )}
        </div>
      </section>
      </Reveal>

      {/* Activity pulse — anonymized social proof */}
      {pulse && <ActivityPulseStrip pulse={pulse} />}

      {/* Community goals — shared targets with live progress */}
      {goals.length > 0 && (
        <Reveal>
        <section className="glass-card p-8">
          <p className="text-sm uppercase tracking-wide text-iron/70">
            Community goals
          </p>
          <div className="mt-4 space-y-5">
            {goals.map((g) => (
              <div key={g.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-iron">
                    {g.title}
                    {g.completed && <span className="ml-2">🏆</span>}
                  </p>
                  <p className="text-sm text-iron/70">
                    {g.current.toLocaleString()} / {g.target.toLocaleString()}{" "}
                    · {g.pct}%
                  </p>
                </div>
                {g.description && (
                  <p className="mt-1 text-sm text-iron/70">{g.description}</p>
                )}
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-iron/10">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, g.pct)}%`,
                      backgroundColor: palette.accent,
                    }}
                  />
                </div>
                <div className="mt-2">
                  <Link
                    href={`/share/goal/${brand.slug}/${g.id}`}
                    className="text-xs text-iron/70 hover:text-iron"
                  >
                    Share this goal →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
        </Reveal>
      )}

      {/* About */}
      <Reveal>
        <LatestStrip slug={slug} />
      </Reveal>

      <Reveal>
      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">

        <div className="glass-card p-8">
          <p className="text-sm uppercase tracking-wide text-iron/70">About</p>
          <p className="mt-4 text-base leading-relaxed text-iron/80 whitespace-pre-line">{brand.bio}</p>
        </div>
        <div className="glass-card p-8">
          <p className="text-sm uppercase tracking-wide text-iron/70">Follow</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {brand.social.length === 0 ? (
              <p className="text-xs text-iron/70">Social links pending.</p>
            ) : (
              brand.social.map((s) => (
                <SocialIcon key={s.label} label={s.label} href={s.href} />
              ))
            )}
          </div>
        </div>
      </section>
      </Reveal>

      {/* Nellie's photos: real kitchen and bar shots, never AI food */}
      {isNellies && (
        <section className="grid gap-6 sm:grid-cols-2">
          {NELLIES_PHOTOS.map((photo, i) => (
            <Reveal key={photo.src} index={i}>
              <figure className="group overflow-hidden rounded-lg border border-iron/10">
                <div className="relative aspect-[4/3]">
                  <Image
                    src={photo.src}
                    alt={photo.alt}
                    fill
                    sizes="(min-width: 640px) 50vw, 100vw"
                    className="bep-photo-zoom object-cover"
                  />
                </div>
                <figcaption className="bg-parchment/30 px-5 py-3 text-sm text-iron/70">
                  {photo.caption}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </section>
      )}

      {/* Top members leaderboard preview */}
      <Reveal>
        <LeaderboardMiniCard brandSlug={slug} />
      </Reveal>

      {/* Stamp card — only shown when config exists and member is signed in */}
      {isSignedIn && stampCardData && (
        <StampCard
          data={stampCardData}
          brandSlug={slug}
          accentFrom={brand.accentFrom}
          accentTo={brand.accentTo}
        />
      )}

      {/* PREDICTIONS — Phase 6.B */}
      <BrandPredictionsSection
        brandSlug={slug}
        viewerMemberId={member?.id ?? null}
        />
      {/* Nellie's: active member offers (lib/nellies-launch.ts) come
          first, then other active specials. The 1,500 card follows the
          catalog reward's active flag. */}
      {guestSpecials.length > 0 && (
        <section id="offers" className="glass-card p-8 scroll-mt-24">
          <Reveal>
            <p className="text-sm uppercase tracking-wide text-iron/70">
              {isNellies ? "Member offers & specials" : "Specials"}
            </p>
          </Reveal>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {guestSpecials.map((s, i) => {
              const access = canAccess(s.tier, entitlement);
              if (!access.allowed) {
                return (
                  <Reveal key={s.id} index={i + 1} className="grid">
                  <PremiumPaywall
                    feature={s.title}
                    description={premiumDescriptionForBrand.specials}
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
                  </Reveal>
                );
              }
              const cadence = formatRecurrence(s);
              return (
                <Reveal key={s.id} index={i + 1} className="grid">
                <div className="rounded-lg bg-parchment/30 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{s.title}</p>
                      {s.description && (
                        <p className="mt-1 text-xs leading-relaxed text-iron/70">
                          {s.description}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <DropCountdown reward={s} />
                        {cadence && (
                          <span className="rounded-full border border-iron/15 bg-iron/5 px-2 py-0.5 uppercase tracking-wide text-iron/70">
                            {cadence}
                          </span>
                        )}
                        {s.tier !== "public" && (
                          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 uppercase tracking-wide text-aurora-ink">
                            {s.tier === "founder-only" ? "Founders" : "Premium"}
                          </span>
                        )}
                        {s.points_required && s.points_required > 0 ? (
                          <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 uppercase tracking-wide text-sage-ink">
                            {s.points_required.toLocaleString()} pts
                          </span>
                        ) : null}
                      </div>
                      {s.redemption_code && (
                        isSignedIn ? (
                          <p className="mt-3 text-xs text-iron/70">
                            Show code{" "}
                            <code className="rounded bg-iron/10 px-1.5 py-0.5 font-mono text-iron/90">
                              {s.redemption_code}
                            </code>{" "}
                            at the register.
                          </p>
                        ) : (
                          <p className="mt-3 text-xs text-iron/70">
                            Member code unlocked after{" "}
                            <Link
                              href={`/signup?ref=${brand.slug}`}
                              className="text-aurora-ink underline underline-offset-2 hover:text-iron"
                            >
                              sign-in
                            </Link>
                            .
                          </p>
                        )
                      )}
                    </div>
                  </div>
                </div>
                </Reveal>
              );
            })}
          </div>
        </section>
      )}

      {/* Upcoming */}
      <section id="upcoming" className="glass-card p-8 scroll-mt-24">
        <Reveal>
          <p className="text-sm uppercase tracking-wide text-iron/70">Upcoming</p>
        </Reveal>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {brand.upcoming.map((e, i) => {
            // Phase 5d: gate premium-tier events. Fallback events (no id)
            // have no DB tier; treat as public.
            const eventTier = e.tier ?? "public";
            const access = canAccess(eventTier, entitlement);
            if (!access.allowed) {
              return (
                <Reveal key={e.id ?? e.title} index={i + 1} className="grid">
                <PremiumPaywall
                  feature={e.title}
                  description={premiumDescriptionForBrand.events}
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
                </Reveal>
              );
            }
            const eventId = e.id ?? null;
            const count = eventId ? rsvpCounts.get(eventId) ?? 0 : 0;
            const atCapacity =
              e.capacity != null && e.capacity > 0 && count >= e.capacity;
            const rsvped = eventId ? myRsvps.has(eventId) : false;
            return (
              <Reveal key={eventId ?? e.title} index={i + 1} className="grid">
              <div className="rounded-lg bg-parchment/30 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{e.title}</p>
                    <p className="text-xs text-iron/70">{e.detail}</p>
                    {e.location && (
                      <p className="mt-1 text-xs text-iron/70">📍 {e.location}</p>
                    )}
                    <p className="mt-3 text-xs uppercase tracking-wide text-iron/70">
                      {e.date}
                    </p>
                    {eventId && count > 0 && (
                      <p className="mt-1 text-xs text-iron/70">
                        {count}
                        {e.capacity ? ` / ${e.capacity}` : ""} RSVPed
                      </p>
                    )}
                    {eventId && count === 0 && isSignedIn && (
                      <p className="mt-1 text-xs text-iron/70">
                        Be the first to RSVP
                      </p>
                    )}
                  </div>
                  {eventId && isSignedIn && (
                    <RsvpButton
                      eventId={eventId}
                      brandSlug={brand.slug}
                      initialRsvped={rsvped}
                      atCapacity={atCapacity}
                      opensAt={e.rsvpOpensAt ?? null}
                      isFounder={entitlement?.isFounder ?? false}
                    />
                  )}
                  {!isSignedIn && (
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Link
                        href={`/login?next=${encodeURIComponent(`/brands/${brand.slug}#upcoming`)}`}
                        className="rounded-full bg-ember px-3 py-1 text-xs font-semibold text-linen bep-press"
                      >
                        Sign in to RSVP
                      </Link>
                      <Link
                        href={`/signup?ref=${encodeURIComponent(brand.slug)}&next=${encodeURIComponent(`/brands/${brand.slug}#upcoming`)}`}
                        className="text-xs text-iron/70 underline-offset-2 hover:text-iron hover:underline"
                      >
                        Join to RSVP
                      </Link>
                    </div>
                  )}
                </div>
                {eventId && (
                  <div className="mt-3 flex items-center gap-3 text-xs">
                    <a
                      href={`/api/events/${eventId}/ics`}
                      className="text-iron/70 hover:text-iron"
                    >
                      📅 Add to calendar
                    </a>
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-iron/70 hover:text-iron"
                      >
                        Details ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {brand.merch.length > 0 && (
        <section className="glass-card p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-wide text-iron/70">Member club rewards</p>
              <p className="mt-1 text-xs text-iron/70">
                Live redeemables on the brand rewards page (points you earn after joining — new
                accounts start at 0).
              </p>
            </div>
            <Link
              href={`/brands/${brand.slug}/rewards`}
              className="text-sm font-medium text-aurora-ink underline underline-offset-2 hover:text-iron"
            >
              Open brand rewards →
            </Link>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {brand.merch.map((m, i) => (
              <Reveal key={m.title} index={i} className="grid">
              <Link
                href={`/brands/${brand.slug}/rewards`}
                className="rounded-lg bg-parchment/30 p-5 transition hover:bg-parchment/40"
              >
                <p className="text-xs uppercase tracking-wide text-iron/70">{m.tier}</p>
                <p className="mt-1 text-sm font-semibold">{m.title}</p>
                <p className="mt-3 text-sm font-semibold text-sage-ink">{m.points}</p>
              </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
