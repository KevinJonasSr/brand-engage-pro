import { notFound } from "next/navigation";
import { type Metadata } from "next";
import Link from "next/link";
import { getBrandFromDb } from "@/lib/data/brands";
import { createAdminClient } from "@/lib/supabase/admin";
import ShareButton from "@/components/share-button";

export const dynamic = "force-static";
export const revalidate = 3600;

async function getBadge(badgeSlug: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("badges")
    .select("name, description, icon")
    .eq("slug", badgeSlug)
    .maybeSingle();
  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; badge: string }>;
}): Promise<Metadata> {
  const { slug, badge: badgeSlug } = await params;
  const [brand, badgeRow] = await Promise.all([
    getBrandFromDb(slug).catch(() => null),
    getBadge(badgeSlug),
  ]);
  const brandName = brand?.name ?? "Brand Engage Pro";
  const badgeName = badgeRow?.name ?? "Badge";
  const title = `${badgeName} — ${brandName}`;
  const description =
    badgeRow?.description ??
    `Earned the ${badgeName} badge for ${brandName} on Brand Engage Pro.`;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: `/share/badge/${slug}/${badgeSlug}`,
      siteName: "Brand Engage Pro",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BadgeSharePage({
  params,
}: {
  params: Promise<{ slug: string; badge: string }>;
}) {
  const { slug, badge: badgeSlug } = await params;
  const [brand, badgeRow] = await Promise.all([
    getBrandFromDb(slug).catch(() => null),
    getBadge(badgeSlug),
  ]);
  if (!brand) notFound();

  const badgeName = badgeRow?.name ?? "Badge";
  const badgeIcon = badgeRow?.icon ?? "🏆";
  const badgeDesc = badgeRow?.description ?? `Earned on Brand Engage Pro`;

  const shareUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/share/badge/${slug}/${badgeSlug}`
      : `https://brand-engage-pro.vercel.app/share/badge/${slug}/${badgeSlug}`;
  const shareTitle = `I earned the ${badgeName} badge for ${brand.name}`;
  const shareText = `${badgeDesc} — ${shareUrl}`;

  return (
    <main className="min-h-screen bg-[#050b1f] text-white flex flex-col items-center justify-center px-6 py-16">
      <div
        className="w-full max-w-lg rounded-2xl border border-white/20 p-8 flex flex-col items-center gap-6 text-center"
        style={{
          background:
            `radial-gradient(circle at 20% 15%, ${brand.accentFrom}66, transparent 55%), ` +
            `radial-gradient(circle at 80% 85%, ${brand.accentTo}66, transparent 60%), ` +
            "rgba(255,255,255,0.03)",
          boxShadow: `0 0 60px ${brand.accentFrom}22`,
        }}
      >
        <p className="text-[10px] tracking-[0.2em] uppercase text-white/30 font-medium">Brand Engage Pro</p>
        <div className="text-7xl leading-none">{badgeIcon}</div>
        <div className="flex flex-col gap-1">
          <p className="text-xs tracking-widest uppercase text-white/50">Badge Unlocked</p>
          <h1
            className="text-3xl font-bold"
            style={{
              background: `linear-gradient(135deg, ${brand.accentFrom}, ${brand.accentTo})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {badgeName}
          </h1>
          <p className="text-white/60 text-sm">for {brand.name}</p>
        </div>
        <p className="text-white/60 text-sm max-w-xs">{badgeDesc}</p>
        <ShareButton
          title={shareTitle}
          text={shareText}
          url={shareUrl}
          label="Share this"
          variant="primary"
        />
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Link
          href={`/brands/${brand.slug}`}
          className="text-sm text-white/50 hover:text-white transition-colors"
        >
          Visit brand experience →
        </Link>
        <p className="text-xs text-white/30 max-w-xs text-center">
          Earn your own badges by engaging with {brand.name}&apos;s community on Brand Engage Pro.
        </p>
      </div>
    </main>
  );
}
