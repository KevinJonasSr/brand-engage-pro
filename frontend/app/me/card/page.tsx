import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, getCurrentMemberKpis } from "@/lib/data/member";
import { getTiers, tierIcon } from "@/lib/data/tiers";
import ShareButton from "@/components/share-button";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "My Member Card" };

export default async function MemberCardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/card");

  const [member, kpis, tiers] = await Promise.all([
    getCurrentMember(),
    getCurrentMemberKpis(),
    getTiers(),
  ]);
  if (!member) redirect("/login?next=/me/card");

  const currentTier = member.current_tier ?? "bronze";
  const currentTierData = tiers.find((t) => t.slug === currentTier);
  const nextTierData = kpis?.next_tier ?? null;
  const totalPoints = kpis?.total_points ?? member.total_points ?? 0;

  const displayName =
    member.first_name && member.last_name
      ? `${member.first_name} ${member.last_name}`
      : member.first_name ?? "Member";

  const shareUrl =
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/members/${member.id}`
      : `https://brand-engage-pro.vercel.app/members/${member.id}`;

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:py-16 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-iron/70">Your card</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Member Card</h1>
        <p className="mt-2 text-sm text-iron/70">
          Share this to flex your tier and invite friends.
        </p>
      </header>

      {/* The card itself */}
      <div
        className="relative overflow-hidden rounded-lg border border-iron/10 p-8 shadow-glass"
        style={{
          background: "linear-gradient(135deg, rgba(212,160,23,0.28) 0%, #f5efe4 50%, rgba(155,35,53,0.14) 100%)",
        }}
      >
        {/* Glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-aurora/20 blur-3xl"
        />

        <div className="relative space-y-6">
          {/* Header row */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-iron/70">
                Brand Engage Pro
              </p>
              <p className="mt-2 text-2xl font-semibold">{displayName}</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-iron/10 px-3 py-1 text-sm font-semibold">
                <span className="text-base">{tierIcon(currentTier)}</span>
                {currentTierData?.display_name ?? "Bronze"}
              </span>
            </div>
          </div>

          {/* Points */}
          <div>
            <p
              className="text-5xl font-semibold tabular-nums"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {totalPoints.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-iron/70">total points</p>
          </div>

          {/* Progress to next tier */}
          {nextTierData && kpis?.points_to_next_tier != null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-iron/70">
                <span>{currentTierData?.display_name}</span>
                <span>{nextTierData.display_name}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-iron/10">
                <div
                  className="h-full rounded-full bg-ember transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      100 -
                        Math.round(
                          (kpis.points_to_next_tier /
                            (nextTierData.min_points - (currentTierData?.min_points ?? 0))) *
                            100,
                        ),
                    )}%`,
                  }}
                />
              </div>
              <p className="text-xs text-iron/70">
                {kpis.points_to_next_tier.toLocaleString()} pts to{" "}
                {nextTierData.display_name}
              </p>
            </div>
          )}

          {/* Badges / stats row */}
          <div className="flex gap-4 border-t border-iron/10 pt-4 text-center">
            <div className="flex-1">
              <p className="text-lg font-semibold">{kpis?.badge_count ?? 0}</p>
              <p className="text-xs text-iron/70">Badges</p>
            </div>
            <div className="flex-1">
              <p className="text-lg font-semibold">{kpis?.referral_count ?? 0}</p>
              <p className="text-xs text-iron/70">Referrals</p>
            </div>
            <div className="flex-1">
              <p className="text-lg font-semibold">
                {currentTierData?.min_points?.toLocaleString() ?? "—"}
              </p>
              <p className="text-xs text-iron/70">Tier min pts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Share + actions */}
      <div className="flex flex-col gap-3">
        <ShareButton
          title={`${displayName} — Brand Engage Pro`}
          text={`I'm a ${currentTierData?.display_name ?? "Bronze"} member on Brand Engage Pro with ${totalPoints.toLocaleString()} points. Join me!`}
          url={shareUrl}
          variant="primary"
          label="Share my card"
        />
        <a
          href="/"
          className="block w-full rounded-full border border-iron/15 py-3 text-center text-sm font-medium text-iron/70 hover:bg-iron/5 transition"
        >
          Back to dashboard
        </a>
      </div>

      <p className="text-center text-xs text-iron/35">
        Members can view your public profile at{" "}
        <span className="text-iron/70">/members/{member.id}</span>
      </p>
    </main>
  );
}
