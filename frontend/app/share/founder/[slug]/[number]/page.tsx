import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBrandFromDb } from "@/lib/data/brands";
import ShareButton from "@/components/share-button";
import { brandWashBackground, resolveBrandAccent } from "@/lib/brand-accent";

// ─── Public founder share page ──────────────────────────────────────────
// Anyone with the URL can see the badge. Founder counts are public;
// member identity is not exposed (we only encode brand + number, not the
// member_id). The matching opengraph-image.tsx renders the certificate
// preview when this URL is shared.

export const dynamic = "force-static";
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}): Promise<Metadata> {
  const { slug, number } = await params;
  const brand = await getBrandFromDb(slug).catch(() => null);
  const brandName = brand?.name ?? "Brand Engage Pro";
  const title = `Founding Member #${number} of ${brandName}`;
  const description = `One of 100 founding members of ${brandName} on Brand Engage Pro. Founders earn 1.5x points for life and RSVP to events 48 hours before everyone else.`;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: `/share/founder/${slug}/${number}`,
      siteName: "Brand Engage Pro",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function FounderSharePage({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}) {
  const { slug, number } = await params;
  const brand = await getBrandFromDb(slug).catch(() => null);
  if (!brand) notFound();

  const founderNumber = parseInt(number, 10);
  if (!Number.isFinite(founderNumber) || founderNumber < 1) notFound();

  const palette = resolveBrandAccent(brand.accentFrom, brand.accentTo);

  const shareUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/share/founder/${slug}/${founderNumber}`
      : `https://brand-engage-pro.vercel.app/share/founder/${slug}/${founderNumber}`;

  const shareTitle = `I'm Founding Member #${founderNumber} of ${brand.name}`;
  const shareText = `One of 100 founding members on Brand Engage Pro. Become a regular: ${shareUrl}`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <section
        className="relative overflow-hidden rounded-lg border border-iron/15 p-10 shadow-glass md:p-14"
        style={{ background: brandWashBackground(palette) }}
      >
        <div className="relative flex flex-col items-center gap-6 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-iron/70">
            Founding Member
          </p>
          <p
            className="text-[120px] font-extrabold leading-none tracking-tight md:text-[180px]"
            style={{ color: palette.accentInk }}
          >
            #{founderNumber}
          </p>
          <p
            className="text-3xl font-normal leading-tight md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            of {brand.name}
          </p>
          <p className="max-w-xl text-sm text-iron/70">
            One of 100 founding members of {brand.name} on Brand Engage Pro.
            Founders earn 1.5x points for life and RSVP to events 48 hours
            before everyone else.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <ShareButton
              title={shareTitle}
              text={shareText}
              url={shareUrl}
              label="Share this"
              variant="primary"
            />
            <Link
              href={`/brands/${brand.slug}`}
              className="rounded-full border border-iron/30 px-5 py-2.5 text-sm font-medium text-iron/85 hover:bg-iron/10"
            >
              Visit member club →
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-10 rounded-lg border border-iron/10 bg-iron/5 p-6 text-sm text-iron/75 md:p-8">
        <p className="font-medium text-iron/90">
          Want to claim a slot at {brand.name}?
        </p>
        <p className="mt-2">
          Founders are capped at 100 per brand. They earn 1.5x points for life
          and RSVP to events 48 hours before everyone else.{" "}
          <Link
            href={`/brands/${brand.slug}`}
            className="text-aurora-ink underline hover:text-iron"
          >
            See what&apos;s live at {brand.name} →
          </Link>
        </p>
      </section>
    </main>
  );
}
