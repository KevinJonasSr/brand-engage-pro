import { notFound } from "next/navigation";
import { type Metadata } from "next";
import Link from "next/link";
import { getBrandFromDb } from "@/lib/data/brands";
import ShareButton from "@/components/share-button";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandFromDb(slug).catch(() => null);
  const brandName = brand?.name ?? "Brand Engage Pro";
  const title = `Premium Member — ${brandName}`;
  const description = `Unlocked the Premium tier for ${brandName} on Brand Engage Pro — member feed, early drops, monthly AMA, and more.`;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: `/share/tier/${slug}`,
      siteName: "Brand Engage Pro",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TierSharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const brand = await getBrandFromDb(slug).catch(() => null);
  if (!brand) notFound();

  const shareUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/share/tier/${slug}`
      : `https://brand-engage-pro.vercel.app/share/tier/${slug}`;
  const shareTitle = `I just unlocked Premium for ${brand.name}`;
  const shareText = `Member feed, early drops, monthly AMA and more — I'm a Premium member for ${brand.name} on Brand Engage Pro. ${shareUrl}`;

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
        <div
          className="text-7xl leading-none"
          style={{
            background: `linear-gradient(135deg, ${brand.accentFrom}, ${brand.accentTo})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          ★
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-xs tracking-widest uppercase text-white/50">Premium Member</p>
          <h1 className="text-3xl font-bold">{brand.name}</h1>
        </div>
        <p className="text-white/60 text-sm max-w-xs">
          Member feed, early drops, monthly AMA, and exclusive community perks.
        </p>
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
          Join {brand.name}&apos;s community on Brand Engage Pro and unlock your own Premium tier.
        </p>
      </div>
    </main>
  );
}
