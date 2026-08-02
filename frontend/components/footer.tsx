import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mx-auto mt-20 max-w-6xl border-t border-white/5 px-6 py-8 text-xs text-white/50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          © {new Date().getFullYear()} Brand Engage Pro. All rights reserved.
        </p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/for-brands" className="hover:text-white">For Brands</Link>
          <Link href="/legal" className="hover:text-white">Legal</Link>
          <Link href="/terms" className="hover:text-white">Terms</Link>
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/cookie-policy" className="hover:text-white">Cookies</Link>
          <Link href="/unsubscribe" className="hover:text-white">Unsubscribe</Link>
          <a href="mailto:support@memberengage.app" className="hover:text-white">Contact</a>
        </nav>
      </div>
    </footer>
  );
}
