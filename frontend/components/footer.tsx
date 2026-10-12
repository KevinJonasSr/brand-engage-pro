import Link from "next/link";

/** Consumer-facing support inbox for Brand Engage Pro soft launch. */
export const BEP_SUPPORT_EMAIL = "support@brandengagepro.com";

export default function Footer() {
  return (
    <footer className="mt-20 bg-iron text-xs text-linen/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8">
        <p>
          © {new Date().getFullYear()} Brand Engage Pro. All rights reserved.
        </p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/legal" className="hover:text-linen">Legal</Link>
          <Link href="/terms" className="text-linen/85 underline underline-offset-4 hover:text-linen">Terms</Link>
          <Link href="/privacy" className="text-linen/85 underline underline-offset-4 hover:text-linen">Privacy</Link>
          <Link href="/cookie-policy" className="text-linen/85 underline underline-offset-4 hover:text-linen">Cookies</Link>
          <Link href="/pricing" className="hover:text-linen">Pricing</Link>
          <Link href="/help" className="hover:text-linen">Help</Link>
          <Link href="/unsubscribe" className="hover:text-linen">Unsubscribe</Link>
          <a href={`mailto:${BEP_SUPPORT_EMAIL}`} className="hover:text-linen">Contact</a>
          <Link href="/for-brands" className="text-linen/50 hover:text-linen/80">
            For Brands
          </Link>
        </nav>
      </div>
    </footer>
  );
}
