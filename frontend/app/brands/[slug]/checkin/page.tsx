"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BRANDS } from "@/lib/brands";

type State =
  | { status: "resolving" }
  | { status: "checking_in" }
  | { status: "success"; pointsAwarded: number; alreadyCheckedIn: boolean }
  | { status: "error"; message: string }
  | { status: "unauthenticated" };

/**
 * /brands/[slug]/checkin
 *
 * Landing page after a member scans the QR code at a brand location.
 * Auth resolves first — logged-out guests never see “Checking you in…”
 * theater; they get Sign in / Create account immediately after session check.
 */
export default function CheckinPage() {
  const params = useParams<{ slug: string }>();
  const brandSlug = params.slug;
  // Proof-of-presence token from the printed QR code (?t=...). The sign-in
  // links only render after the first client effect, so reading
  // window.location here cannot cause a hydration mismatch.
  const token = readCheckinToken();
  const checkinPath = brandSlug
    ? `/brands/${brandSlug}/checkin${token ? `?t=${encodeURIComponent(token)}` : ""}`
    : "/";

  const brandName = useMemo(() => {
    if (!brandSlug) return "this brand";
    return BRANDS[brandSlug]?.name ?? brandSlug;
  }, [brandSlug]);

  // Start in resolving — never imply a successful check-in before auth.
  const [state, setState] = useState<State>({ status: "resolving" });

  const runCheckin = useCallback(async () => {
    if (!brandSlug) {
      setState({ status: "error", message: "Missing brand for this check-in link." });
      return;
    }

    setState({ status: "resolving" });

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setState({ status: "unauthenticated" });
        return;
      }

      // Only signed-in members see the real check-in spinner.
      setState({ status: "checking_in" });

      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_slug: brandSlug, token: readCheckinToken() }),
      });

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
    } catch {
      setState({ status: "error", message: "Network error — try again." });
    }
  }, [brandSlug]);

  useEffect(() => {
    void runCheckin();
  }, [runCheckin]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      {state.status === "resolving" && (
        <div className="space-y-4">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-iron/10 border-t-aurora" />
          <p className="text-sm text-iron/50">One moment…</p>
        </div>
      )}

      {state.status === "checking_in" && (
        <div className="space-y-4">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-iron/10 border-t-aurora" />
          <p className="text-sm text-iron/60">Checking you in at {brandName}…</p>
        </div>
      )}

      {state.status === "unauthenticated" && (
        <div className="space-y-6">
          <div className="text-5xl">🔑</div>
          <h1 className="text-2xl font-semibold">Sign in to check in</h1>
          <p className="max-w-sm text-sm text-iron/60">
            Create a free account or sign in to earn visit points at{" "}
            <span className="text-iron/80">{brandName}</span>.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href={`/login?next=${encodeURIComponent(checkinPath)}`}
              className="rounded-full bg-ember px-6 py-3 text-sm font-semibold text-linen"
            >
              Sign in to check in →
            </Link>
            <Link
              href={`/signup?ref=${encodeURIComponent(brandSlug ?? "")}&next=${encodeURIComponent(checkinPath)}`}
              className="text-sm text-iron/60 hover:text-iron"
            >
              New here? Create a free account
            </Link>
          </div>
        </div>
      )}

      {state.status === "success" && !state.alreadyCheckedIn && (
        <div className="space-y-6">
          <div className="text-6xl">🎉</div>
          <h1 className="text-3xl font-semibold">You&apos;re checked in!</h1>
          <p className="text-xl font-semibold text-sage-ink">
            +{state.pointsAwarded} points earned
          </p>
          <p className="max-w-xs text-sm text-iron/60">
            Your visit to {brandName} has been recorded. Come back tomorrow for another{" "}
            {state.pointsAwarded} pts.
          </p>
          <Link
            href={`/brands/${brandSlug}`}
            className="inline-block rounded-full bg-ember px-6 py-3 text-sm font-semibold text-linen"
          >
            Back to {brandName} →
          </Link>
        </div>
      )}

      {state.status === "success" && state.alreadyCheckedIn && (
        <div className="space-y-6">
          <div className="text-6xl">✅</div>
          <h1 className="text-2xl font-semibold">Already checked in today</h1>
          <p className="max-w-xs text-sm text-iron/60">
            You&apos;ve already earned your visit points at {brandName} today. See you tomorrow!
          </p>
          <Link
            href={`/brands/${brandSlug}`}
            className="inline-block rounded-full border border-iron/20 px-6 py-3 text-sm font-medium text-iron/80 hover:bg-iron/10"
          >
            Back to {brandName}
          </Link>
        </div>
      )}

      {state.status === "error" && (
        <div className="space-y-6">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-2xl font-semibold">Check-in failed</h1>
          <p className="max-w-xs text-sm text-iron/60">{state.message}</p>
          <button
            onClick={() => {
              void runCheckin();
            }}
            className="rounded-full border border-iron/20 px-6 py-3 text-sm font-medium text-iron/80 hover:bg-iron/10"
          >
            Try again
          </button>
        </div>
      )}
    </main>
  );
}

/** The `t` token from the scanned QR URL, or null (server render or none). */
function readCheckinToken(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("t");
}
