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
  params: Promise<{ slug: string; drop: string }>;
}): Promise<Metadata> {
  const { slug, drop } = await params;
  const brand = await getBrandFromDb(slug).catch(() => null);
  const brandName = brand?.name ?? "Brand Engage Pro";
  const dropLabel = decodeURIComponent(drop)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const title = `Exclusive Drop: ${dropLabel} — ${brandName}`;
  const description = `Premium members got first access to ${dropLabel} from ${brandName} on Brand Engage Pro.`;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: `/share/drop/${slug}/${drop}`,
      siteName: "Brand Engage Pro",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DropSharePage({
  params,
}: {
  params: Promise<{ slug: string; drop: string }>;
}) {
  const { slug, drop } = await params;
  const brand = await getBrandFromDb(slug).catch(() => null);
  if (!brand) notFound();

  const dropLabel = decodeURIComponent(drop)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const shareUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/share/drop/${slug}/${drop}`
      : `https://brand-engage-pro.vercel.app/share/drop/${slug}/${drop}`;
  const shareTitle = `I got early access to ${dropLabel} from ${brand.name}`;
  const shareText = `Premium members on Brand Engage Pro got first access. Don't miss the next one: ${shareUrl}`;

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
        <div className="text-7xl leading-none">🎁</div>
        <div className="flex flex-col gap-1">
          <p className="text-xs tracking-widest uppercase text-white/50">Exclusive Drop</p>
          <h1
            className="text-3xl font-bold"
            style={{
              background: `linear-gradient(135deg, ${brand.accentFrom}, ${brand.accentTo})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {dropLabel}
          </h1>
          <p className="text-white/60 text-sm">from {brand.name}</p>
        </div>
        <p className="text-white/60 text-sm max-w-xs">
          Premium members on Brand Engage Pro get first access to exclusive drops. Don&apos;t miss the next one.
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
          Unlock Premium to get first access to {brand.name}&apos;s drops on Brand Engage Pro.
        </p>
      </div>
    </main>
  );
}
