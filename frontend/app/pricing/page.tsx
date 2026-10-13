import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "$50 per brand per month after a 30-day free trial. Our first 10 founding brands are free for 12 months, then $50 per month. Works with any POS, no Square or Toast required.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    type: "website",
    url: "/pricing",
    siteName: "Brand Engage Pro",
    title: "Pricing",
    description:
      "$50 per brand per month after a 30-day free trial. Our first 10 founding brands are free for 12 months, then $50 per month.",
  },
};

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-16">
      <section className="space-y-6 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-iron/70">
          For Brands
        </p>
        <h1
          className="text-5xl font-semibold leading-[1.05]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Pricing
        </h1>
        <p className="mx-auto max-w-2xl text-base text-iron/80 md:text-lg">
          $50 per brand per month after a 30-day free trial. Our first 10
          founding brands are free for 12 months, then $50 per month. Works
          with any POS, no Square or Toast required.
        </p>
        <p className="mx-auto max-w-2xl text-sm text-iron/70">
          Included: check-in rewards, points, and member messaging by email.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/for-brands/apply"
            className="rounded-full bg-ember px-6 py-3 text-sm font-semibold text-linen shadow-glass transition hover:brightness-110"
          >
            Apply to launch your member club →
          </Link>
          <Link
            href="/for-brands"
            className="rounded-full border border-iron/30 px-6 py-3 text-sm font-medium text-iron/80 hover:bg-iron/10"
          >
            For brands
          </Link>
        </div>
        <p className="text-xs text-iron/70">
          No payment or contract required to apply.
        </p>
      </section>
    </main>
  );
}
