"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type State =
  | { status: "loading" }
  | { status: "success"; pointsAwarded: number; alreadyCheckedIn: boolean }
  | { status: "error"; message: string }
  | { status: "unauthenticated" };

/**
 * /brands/[slug]/checkin
 *
 * Landing page after a member scans the QR code at a brand location.
 * Auto-fires the check-in on mount, then shows a confirmation or error.
 * For unauthenticated visitors, shows a sign-in prompt then redirects back.
 */
export default function CheckinPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const brandSlug = params.slug;

  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!brandSlug) return;

    fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_slug: brandSlug }),
    })
      .then(async (res) => {
        if (res.status === 401) {
          setState({ status: "unauthenticated" });
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          setState({ status: "error", message: data.error ?? "Something went wrong" });
          return;
        }
        setState({
          status: "success",
          pointsAwarded: data.pointsAwarded,
          alreadyCheckedIn: data.alreadyCheckedIn,
        });
      })
      .catch(() => setState({ status: "error", message: "Network error — try again." }));
  }, [brandSlug]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      {state.status === "loading" && (
        <div className="space-y-4">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-aurora" />
          <p className="text-sm text-white/60">Checking you in…</p>
        </div>
      )}

      {state.status === "unauthenticated" && (
        <div className="space-y-6">
          <div className="text-5xl">🔑</div>
          <h1 className="text-2xl font-semibold">Sign in to check in</h1>
          <p className="max-w-xs text-sm text-white/60">
            Create a free account or sign in to earn your {brandSlug} visit points.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href={`/signup?ref=${brandSlug}&next=/brands/${brandSlug}/checkin`}
              className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white"
            >
              Create free account →
            </Link>
            <Link
              href={`/login?next=/brands/${brandSlug}/checkin`}
              className="text-sm text-white/60 hover:text-white"
            >
              Already a member? Sign in
            </Link>
          </div>
        </div>
      )}

      {state.status === "success" && !state.alreadyCheckedIn && (
        <div className="space-y-6">
          <div className="text-6xl">🎉</div>
          <h1 className="text-3xl font-semibold">You&apos;re checked in!</h1>
          <p className="text-xl font-semibold text-emerald-300">
            +{state.pointsAwarded} points earned
          </p>
          <p className="max-w-xs text-sm text-white/60">
            Your visit has been recorded. Come back tomorrow for another {state.pointsAwarded} pts.
          </p>
          <Link
            href={`/brands/${brandSlug}`}
            className="inline-block rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white"
          >
            Back to {brandSlug} →
          </Link>
        </div>
      )}

      {state.status === "success" && state.alreadyCheckedIn && (
        <div className="space-y-6">
          <div className="text-6xl">✅</div>
          <h1 className="text-2xl font-semibold">Already checked in today</h1>
          <p className="max-w-xs text-sm text-white/60">
            You&apos;ve already earned your visit points today. See you tomorrow!
          </p>
          <Link
            href={`/brands/${brandSlug}`}
            className="inline-block rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
          >
            Back to {brandSlug}
          </Link>
        </div>
      )}

      {state.status === "error" && (
        <div className="space-y-6">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-2xl font-semibold">Check-in failed</h1>
          <p className="max-w-xs text-sm text-white/60">{state.message}</p>
          <button
            onClick={() => {
              setState({ status: "loading" });
              router.refresh();
            }}
            className="rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
          >
            Try again
          </button>
        </div>
      )}
    </main>
  );
}
