import Link from "next/link";

export default function BrandNotFound() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-iron/70">
        Brand not found
      </p>
      <h1
        className="text-4xl font-semibold leading-tight"
        style={{ fontFamily: "var(--font-display)" }}
      >
        That brand isn&apos;t here.
      </h1>
      <p className="text-sm text-iron/70">
        It may have changed its address, or it hasn&apos;t joined yet. Browse
        the brands that are live, or head back home.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
        <Link
          href="/brands"
          className="rounded-full bg-ember px-6 py-3 text-sm font-semibold text-linen shadow-glass transition hover:brightness-110"
        >
          Browse brands
        </Link>
        <Link
          href="/"
          className="rounded-full border border-iron/30 px-6 py-3 text-sm font-medium text-iron/80 hover:bg-iron/10"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
