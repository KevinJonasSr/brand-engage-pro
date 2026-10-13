import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BEP_SUPPORT_EMAIL } from "@/components/footer";

export const metadata: Metadata = {
  title: "Help",
  description:
    "Answers for members and brands on Brand Engage Pro, and how to reach support@brandengagepro.com.",
  alternates: { canonical: "/help" },
  openGraph: {
    type: "website",
    url: "/help",
    siteName: "Brand Engage Pro",
    title: "Help",
    description:
      "Check-in, points, brand pricing, and how to reach Brand Engage Pro support.",
  },
};

const faqs: { q: string; a: ReactNode }[] = [
  {
    q: "How do I check in?",
    a: "Scan the brand's check-in code at the location. If you are not signed in yet, use Sign in or Join on that page. After you sign in or finish joining, you come back to the same check-in.",
  },
  {
    q: "How do points and check-in rewards work?",
    a: "A successful check-in records your visit and adds points for that brand. Rewards you can use those points on live on the brand's page.",
  },
  {
    q: "How do I join or sign in?",
    a: (
      <>
        New members{" "}
        <Link href="/signup" className="text-iron underline-offset-4 hover:underline">
          join
        </Link>{" "}
        with an email and password. Returning members{" "}
        <Link href="/login" className="text-iron underline-offset-4 hover:underline">
          sign in
        </Link>
        .
      </>
    ),
  },
  {
    q: "What does it cost for a brand?",
    a: (
      <>
        $50 per brand per month after a 30-day free trial. Our first 10 founding
        brands are free for 12 months, then $50 per month. The plan includes
        check-in rewards, points, and member
        messaging by email, and it works with any POS.{" "}
        <Link href="/pricing" className="text-iron underline-offset-4 hover:underline">
          See pricing
        </Link>
        .
      </>
    ),
  },
  {
    q: "How does a brand get started?",
    a: (
      <>
        Apply from{" "}
        <Link href="/for-brands" className="text-iron underline-offset-4 hover:underline">
          For brands
        </Link>
        . There is no payment or contract required to apply.
      </>
    ),
  },
  {
    q: "How do I stop member emails?",
    a: (
      <>
        Use the unsubscribe link in the message, or open{" "}
        <Link href="/unsubscribe" className="text-iron underline-offset-4 hover:underline">
          Unsubscribe
        </Link>
        .
      </>
    ),
  },
];

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-12 px-6 py-16">
      <section className="space-y-4 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-iron/70">Help</p>
        <h1
          className="text-5xl font-semibold leading-[1.05]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          How can we help?
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-iron/75">
          Email{" "}
          <a
            href={`mailto:${BEP_SUPPORT_EMAIL}`}
            className="text-iron underline-offset-4 hover:underline"
          >
            {BEP_SUPPORT_EMAIL}
          </a>{" "}
          and we will get back to you.
        </p>
      </section>

      <section className="space-y-3">
        {faqs.map((item) => (
          <details
            key={item.q}
            className="group rounded-lg border border-iron/10 bg-parchment/30 p-5 transition hover:border-iron/25"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium text-iron/90">
              <span>{item.q}</span>
              <span className="text-aurora-ink transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm text-iron/70">{item.a}</p>
          </details>
        ))}
      </section>
    </main>
  );
}
