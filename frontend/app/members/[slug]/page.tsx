import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMemberProfileBySlug } from "@/lib/data/member-profile";
import ShareButton from "@/components/share-button";

export const dynamic = "force-dynamic";

const TIER_COLORS: Record<string, { from: string; to: string; label: string }> = {
  bronze: { from: "#a16207", to: "#fbbf24", label: "Bronze" },
  silver: { from: "#94a3b8", to: "#e2e8f0", label: "Silver" },
  gold: { from: "#ca8a04", to: "#fde68a", label: "Gold" },
  platinum: { from: "#e0e7ff", to: "#c7d2fe", label: "Platinum" },
};

function getTierStyle(tier: string) {
  return TIER_COLORS[tier.toLowerCase()] ?? TIER_COLORS.bronze;
}

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getMemberProfileBySlug(slug);
  if (!profile) return { title: "Member profile · Brand Engage Pro" };

  const name = profile.firstName ?? profile.profileSlug;
  const founderCount = profile.founderBadges.length;
  const desc = founderCount
    ? `${name}'s member profile · ${getTierStyle(profile.tier).label} tier · Founding Member of ${profile.founderBadges
        .map((f) => f.communityName)
        .join(", ")}`
    : `${name}'s member profile · ${getTierStyle(profile.tier).label} tier · ${profile.totalPoints.toLocaleString()} perks`;

  return {
    title: `${name} · Brand Engage Pro`,
    description: desc,
    alternates: { canonical: `/members/${profile.profileSlug}` },
    openGraph: {
      type: "profile",
      url: `/members/${profile.profileSlug}`,
      siteName: "Brand Engage Pro",
      title: `${name}'s member profile · Brand Engage Pro`,
      description: desc,
    },
    twitter: {
      card: "summary_large_image",
      title: `${name}'s member profile · Brand Engage Pro`,
      description: desc,
    },
  };
}

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getMemberProfileBySlug(slug);
  if (!profile) notFound();

  const tier = getTierStyle(profile.tier);
  const initial = (profile.firstName?.[0] ?? "M").toUpperCase();
  const displayName = profile.firstName ?? profile.profileSlug;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://brand-engage-pro.vercel.app";
  const profileUrl = `${appUrl}/members/${profile.profileSlug}`;
  const shareTitle = `${displayName}'s member profile on Brand Engage Pro`;
  const founderLine = profile.founderBadges.length
    ? `Founding Member of ${profile.founderBadges.map((f) => f.communityName).join(", ")}.`
    : "";
  const shareText = `${shareTitle}. ${founderLine} ${profile.totalPoints.toLocaleString()} pts · ${tier.label} tier. ${profileUrl}`;

  // Pretty-print social handles (currently the onboarding wizard
  // collects one combined "TikTok or Instagram" value; future fields
  // can drop into this same block).
  const socialHandle = profile.socials.instagram_or_tiktok?.trim();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden rounded-3xl border border-white/15 p-8 shadow-glass md:p-10"
        style={{
          background: `radial-gradient(circle at 15% 10%, ${tier.from}55, transparent 55%), radial-gradient(circle at 85% 95%, ${tier.to}55, transparent 60%), #050b1f`,
        }}
      >
        <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center">
          {profile.avatarUrl ? (
            <Image
              src={profile.avatarUrl}
              alt={`${displayName} avatar`}
              width={96}
              height={96}
              className="h-24 w-24 rounded-full border-2 border-white/20 object-cover"
            />
          ) : (
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/20 text-3xl font-bold"
              style={{
                backgroundImage: `linear-gradient(135deg, ${tier.from}, ${tier.to})`,
              }}
            >
              {initial}
            </div>
          )}
          <div className="flex-1">
            <p
              className="text-xs font-medium uppercase tracking-[0.3em]"
              style={{ color: tier.to }}
            >
              {tier.label} tier
            </p>
            <h1
              className="mt-2 text-3xl font-semibold leading-tight md:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {displayName}
            </h1>
            <p className="mt-2 text-sm text-white/65">
              @{profile.profileSlug} · Member since {formatMemberSince(profile.memberSince)}
            </p>
            {socialHandle && (
              <p className="mt-1 text-xs text-white/55">
                Find them on TikTok/Instagram: {socialHandle}
              </p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="relative mt-8 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-white/5 px-3 py-4">
            <p className="text-2xl font-bold tabular-nums">
              {profile.totalPoints.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-white/60">total points</p>
          </div>
          <div className="rounded-2xl bg-white/5 px-3 py-4">
            <p className="text-2xl font-bold tabular-nums">
              {profile.founderBadges.length}
            </p>
            <p className="mt-1 text-xs text-white/60">founder badges</p>
          </div>
          <div className="rounded-2xl bg-white/5 px-3 py-4">
            <p className="text-2xl font-bold tabular-nums">
              {profile.brands.length}
            </p>
            <p className="mt-1 text-xs text-white/60">brands followed</p>
          </div>
        </div>

        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
          <ShareButton
            title={shareTitle}
            text={shareText}
            url={profileUrl}
            label="Share my profile"
            variant="primary"
          />
        </div>
      </section>

      {profile.founderBadges.length > 0 && (
        <section className="mt-12 space-y-4">
          <h2
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            🌟 Founding Member
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {profile.founderBadges.map((f) => (
              <Link
                key={f.communitySlug}
                href={`/share/founder/${f.communitySlug}/${f.founderNumber}`}
                className="group relative overflow-hidden rounded-2xl border border-white/10 p-5 transition hover:border-white/30"
                style={{
                  background: `radial-gradient(circle at 15% 10%, ${f.accentFrom}33, transparent 60%), radial-gradient(circle at 85% 90%, ${f.accentTo}33, transparent 60%), rgba(255,255,255,0.03)`,
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-widest text-white/65">
                    Founding Member of
                  </p>
                  <p
                    className="text-3xl font-bold tabular-nums"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${f.accentFrom}, ${f.accentTo})`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    #{f.founderNumber}
                  </p>
                </div>
                <p className="mt-2 text-lg font-semibold">{f.communityName}</p>
                <p className="mt-3 text-xs text-white/55 transition group-hover:text-white/80">
                  See badge →
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {profile.badges.length > 0 && (
        <section className="mt-12 space-y-4">
          <h2
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Badges earned
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profile.badges.map((b) => (
              <div
                key={b.slug + b.earnedAt}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <p className="text-sm font-semibold">{b.name}</p>
                {b.description && (
                  <p className="mt-1 text-xs text-white/60 line-clamp-2">
                    {b.description}
                  </p>
                )}
                <p className="mt-3 text-[11px] text-white/45">
                  Earned{" "}
                  {new Date(b.earnedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {profile.brands.length > 0 && (
        <section className="mt-12 space-y-4">
          <h2
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Following
          </h2>
          <div className="flex flex-wrap gap-2">
            {profile.brands.map((b) => (
              <Link
                key={b.slug}
                href={`/brands/${b.slug}`}
                className="rounded-full border border-white/15 bg-black/30 px-4 py-1.5 text-sm text-white/85 hover:border-white/30 hover:bg-white/5"
              >
                {b.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {profile.founderBadges.length === 0 &&
        profile.badges.length === 0 &&
        profile.brands.length === 0 && (
          <section className="mt-12 rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-sm text-white/70">
              {displayName} just joined Brand Engage Pro. Their member journey
              starts here.
            </p>
            <Link
              href="/brands"
              className="mt-4 inline-flex rounded-full border border-white/25 px-4 py-2 text-xs font-medium text-white/85 hover:bg-white/10"
            >
              Browse brands
            </Link>
          </section>
        )}

      <section className="mt-16 rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-sm font-medium text-white/85">
          Want a profile of your own?
        </p>
        <p className="mt-1 text-xs text-white/55">
          Follow brands, earn perks, unlock specials and badges. Your member
          profile builds itself.
        </p>
        <Link
          href="/brands"
          className="mt-4 inline-flex rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2.5 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
        >
          Find your brands →
        </Link>
      </section>
    </main>
  );
}
