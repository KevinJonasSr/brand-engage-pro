"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-20 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-iron/70">
        Something went wrong
      </p>
      <h1
        className="text-4xl font-semibold leading-tight"
        style={{ fontFamily: "var(--font-display)" }}
      >
        This page hit a snag.
      </h1>
      <p className="text-sm text-iron/70">
        It&apos;s usually temporary. Try again, or head back home.
        {error.digest ? (
          <span className="mt-2 block font-mono text-xs text-iron/50">
            Reference: {error.digest}
          </span>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-full bg-ember px-6 py-3 text-sm font-semibold text-linen shadow-glass transition hover:brightness-110"
        >
          Try again
        </button>
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
