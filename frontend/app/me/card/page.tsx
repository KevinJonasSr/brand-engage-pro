import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, getCurrentMemberKpis } from "@/lib/data/member";
import { getTiers, tierIcon } from "@/lib/data/tiers";
import { listCardMemberships } from "@/lib/data/redemptions";
import { appBaseUrl, memberCardUrl } from "@/lib/redemption-code";
import ShareButton from "@/components/share-button";
import MemberCard, { type CardBrand } from "./member-card";
import type { Metadata } from "next";
import type { Tier, TierSlug } from "@/lib/data/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "My Member Card" };

/**
 * Progress from the member's tier toward the next rung of the ladder.
 * The card shows the member-level tier (members.current_tier, the same one
 * Member Home and /rewards show) so a member is never "Silver" on one page
 * and "Bronze" on their card; the per-brand row only contributes "points
 * earned here".
 */
function brandProgress(tiers: Tier[], current: TierSlug, lifetime: number) {
  const ladder = [...tiers].sort((a, b) => a.sort_order - b.sort_order);
  const i = ladder.findIndex((t) => t.slug === current);
  const cur = ladder[i] ?? ladder[0];
  const next = i >= 0 ? ladder[i + 1] : undefined;
  if (!cur || !next) {
    return { tierName: cur?.display_name ?? "Bronze", nextTierName: null, pointsToNext: null, progressPct: null };
  }
  const span = Math.max(1, next.min_points - cur.min_points);
  const pointsToNext = Math.max(0, next.min_points - lifetime);
  const progressPct = Math.max(0, Math.min(100, Math.round(((lifetime - cur.min_points) / span) * 100)));
  return { tierName: cur.display_name, nextTierName: next.display_name, pointsToNext, progressPct };
}

export default async function MemberCardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/card");

  const [member, kpis, tiers, memberships] = await Promise.all([
    getCurrentMember(),
    getCurrentMemberKpis(),
    getTiers(),
    listCardMemberships(user.id),
  ]);
  if (!member) redirect("/login?next=/me/card");

  const spendablePoints = kpis?.spendable_points ?? kpis?.total_points ?? member.total_points ?? 0;
  const lifetimePoints = Math.max(kpis?.lifetime_points ?? 0, spendablePoints);

  const displayName =
    member.first_name && member.last_name
      ? `${member.first_name} ${member.last_name}`
      : member.first_name ?? "Member";

  // One card per joined brand. A member with no membership row still gets
  // a card using their profile-level tier so the page never renders empty.
  const brands: CardBrand[] = (
    memberships.length > 0
      ? memberships
      : [
          {
            communityId: "",
            brandName: "Brand Engage Pro",
            currentTier: (member.current_tier ?? "bronze") as TierSlug,
            brandLifetimePoints: 0,
            isFounder: false,
            joinedAt: "",
          },
        ]
  ).map((m) => {
    const memberTier = (member.current_tier ?? "bronze") as TierSlug;
    const p = brandProgress(tiers, memberTier, lifetimePoints);
    return {
      communityId: m.communityId,
      brandName: m.brandName,
      tierSlug: memberTier,
      tierName: p.tierName,
      tierIcon: tierIcon(memberTier),
      brandLifetimePoints: m.communityId ? m.brandLifetimePoints : null,
      isFounder: m.isFounder,
      nextTierName: p.nextTierName,
      pointsToNext: p.pointsToNext,
      progressPct: p.progressPct,
    };
  });

  const base = appBaseUrl();
  const shareUrl = memberCardUrl(member.id, base);
  const primary = brands[0];
  const memberRef = member.id.replace(/-/g, "").slice(0, 8).toUpperCase();

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:py-16 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-iron/70">Your card</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Member Card</h1>
        <p className="mt-2 text-sm text-iron/70">
          Show it at the counter, or share it to invite friends.
        </p>
      </header>

      <MemberCard
        displayName={displayName}
        memberRef={memberRef}
        spendablePoints={spendablePoints}
        lifetimePoints={lifetimePoints}
        brands={brands}
        qrValue={shareUrl}
      />

      {/* Share + actions */}
      <div className="flex flex-col gap-3">
        <Link
          href="/me/redemptions"
          className="block w-full rounded-full bg-iron py-3 text-center text-sm font-medium text-linen hover:bg-iron/90 transition"
        >
          My redemptions
        </Link>
        <ShareButton
          title={`${displayName} — ${primary?.brandName ?? "Brand Engage Pro"}`}
          text={`I'm a ${primary?.tierName ?? "Bronze"} member${primary?.brandName ? ` at ${primary.brandName}` : ""} with ${lifetimePoints.toLocaleString()} lifetime points. Join me!`}
          url={shareUrl}
          variant="primary"
          label="Share my card"
        />
        <Link
          href="/"
          className="block w-full rounded-full border border-iron/15 py-3 text-center text-sm font-medium text-iron/70 hover:bg-iron/5 transition"
        >
          Back to dashboard
        </Link>
      </div>

      <p className="text-center text-xs text-iron/35">
        Staff can scan the QR to open your public profile at{" "}
        <span className="text-iron/70">/members/{member.id}</span>
      </p>
    </main>
  );
}
