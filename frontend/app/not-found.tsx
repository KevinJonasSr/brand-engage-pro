import Link from "next/link";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-iron/70">404</p>
      <h1
        className="text-4xl font-semibold leading-tight"
        style={{ fontFamily: "var(--font-display)" }}
      >
        We couldn&apos;t find that page.
      </h1>
      <p className="text-sm text-iron/70">
        The link may be out of date, or the page may have moved.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
        <Link
          href="/"
          className="rounded-full bg-ember px-6 py-3 text-sm font-semibold text-linen shadow-glass transition hover:brightness-110"
        >
          Go home
        </Link>
        <Link
          href="/brands"
          className="rounded-full border border-iron/30 px-6 py-3 text-sm font-medium text-iron/80 hover:bg-iron/10"
        >
          Browse brands
        </Link>
      </div>
    </main>
  );
}
