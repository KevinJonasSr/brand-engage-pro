import { ImageResponse } from "next/og";
import { ShareCard, eyebrowStyle, subStyle } from "@/components/og/share-card";
import { sharePalette } from "@/lib/brand-accent";
import { getMemberProfileBySlug } from "@/lib/data/member-profile";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Member profile on Brand Engage Pro";

const TIER_COLORS: Record<string, { from: string; to: string; label: string }> = {
  bronze: { from: "#a16207", to: "#fbbf24", label: "Bronze" },
  silver: { from: "#94a3b8", to: "#e2e8f0", label: "Silver" },
  gold: { from: "#ca8a04", to: "#fde68a", label: "Gold" },
  platinum: { from: "#e0e7ff", to: "#c7d2fe", label: "Platinum" },
};

export default async function MemberProfileOpengraphImage({
  params,
}: {
  params: { slug: string };
}) {
  const profile = await getMemberProfileBySlug(params.slug).catch(() => null);

  const displayName = profile?.firstName ?? "Member";
  const slug = profile?.profileSlug ?? params.slug;
  const tier = TIER_COLORS[(profile?.tier ?? "bronze").toLowerCase()] ?? TIER_COLORS.bronze;
  const palette = sharePalette(tier.from, tier.to);
  const points = profile?.totalPoints ?? 0;
  const founderCount = profile?.founderBadges.length ?? 0;
  const founderForLine = profile?.founderBadges
    .slice(0, 3)
    .map((f) => f.communityName)
    .join(" · ");

  return new ImageResponse(
    (
      <ShareCard
        palette={palette}
        align="start"
        cta="Build yours →"
        caption={
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 40, fontWeight: 700, color: palette.text }}>
              {points.toLocaleString()}
            </span>
            <span>points earned</span>
          </div>
        }
      >
        <div style={eyebrowStyle(palette)}>
          {tier.label} tier · @{slug}
        </div>
        <div
          style={{
            fontSize: 110,
            fontWeight: 700,
            lineHeight: 0.98,
            letterSpacing: "-0.04em",
            maxWidth: 1040,
            color: palette.text,
          }}
        >
          {displayName}&apos;s member profile
        </div>
        {founderCount > 0 ? (
          <div style={{ ...subStyle(palette, 28), display: "flex", marginTop: 6 }}>
            🌟 Founding Member · {founderForLine}
            {founderCount > 3 ? ` · +${founderCount - 3} more` : ""}
          </div>
        ) : (
          <div style={{ ...subStyle(palette, 28), display: "flex", marginTop: 6 }}>
            Skip the line. Earn the perks. Become a regular.
          </div>
        )}
      </ShareCard>
    ),
    { ...size },
  );
}
