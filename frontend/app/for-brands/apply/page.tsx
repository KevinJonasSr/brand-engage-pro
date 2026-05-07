import ApplyForm from "./apply-form";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Apply to launch your member club · Brand Engage Pro",
  description:
    "Apply to launch a Brand Engage Pro member club. We review applications within 48 hours. No payment or contract required to apply.",
  alternates: { canonical: "/for-brands/apply" },
  openGraph: {
    type: "website",
    url: "/for-brands/apply",
    siteName: "Brand Engage Pro",
    title: "Apply to launch your member club · Brand Engage Pro",
    description:
      "Tell us about your brand and your members. We review every application within 48 hours.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Apply to launch your member club · Brand Engage Pro",
    description:
      "Tell us about your brand and your members. We review every application within 48 hours.",
  },
};

export const dynamic = "force-dynamic";

export default function ApplyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          For Brands · Apply
        </p>
        <h1
          className="text-4xl font-semibold leading-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Tell us about your brand
        </h1>
        <p className="text-sm text-white/70">
          We review applications within 48 hours. Required fields are marked.
        </p>
      </header>
      <ApplyForm />
    </main>
  );
}
