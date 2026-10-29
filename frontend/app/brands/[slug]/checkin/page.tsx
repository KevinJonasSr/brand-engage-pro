"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BRANDS } from "@/lib/brands";
import {
  checkinDetails,
  checkinHeadline,
  stampBarPercent,
  type CheckinProgress,
} from "@/components/checkin-progress-copy";

type State =
  | { status: "resolving" }
  | { status: "checking_in" }
  | {
      status: "success";
      pointsAwarded: number;
      alreadyCheckedIn: boolean;
      progress: CheckinProgress | null;
    }
  | { status: "error"; message: string }
  | { status: "unauthenticated" };

/**
 * /brands/[slug]/checkin
 *
 * Landing page after a member scans the QR code at a brand location.
 * Auth resolves first — logged-out guests never see “Checking you in…”
 * theater. While the session check is in flight, and when it finds no
 * session, they see Sign in and Join. The check-in request itself still
 * runs only after a session exists.
 */
export default function CheckinPage() {
  const params = useParams<{ slug: string }>();
  const brandSlug = params.slug;
  // Proof-of-presence token from the printed QR code (?t=...). Read through
  // a store so the server snapshot (null) and the client snapshot stay
  // consistent without a setState-in-effect.
  const returnToken = useSyncExternalStore(
    subscribeNoop,
    readCheckinToken,
    () => null,
  );
  const checkinPath = brandSlug
    ? `/brands/${brandSlug}/checkin${returnToken ? `?t=${encodeURIComponent(returnToken)}` : ""}`
    : "/";

  const brandName = useMemo(() => {
    if (!brandSlug) return "this brand";
    return BRANDS[brandSlug]?.name ?? brandSlug;
  }, [brandSlug]);

  // Start in resolving — never imply a successful check-in before auth.
  const [state, setState] = useState<State>({ status: "resolving" });

  // Each phase is reported from performCheckin's callbacks (after an await),
  // never synchronously from the effect body.
  const runCheckin = useCallback(() => {
    void performCheckin(brandSlug, setState);
  }, [brandSlug]);

  useEffect(() => {
    runCheckin();
  }, [runCheckin]);

  return (
    <main
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center"
    >
      {(state.status === "resolving" || state.status === "unauthenticated") && (
        <SignedOutCheckin
          brandName={brandName}
          brandSlug={brandSlug}
          checkinPath={checkinPath}
        />
      )}

      {state.status === "checking_in" && (
        <div className="space-y-4">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-iron/10 border-t-aurora" />
          <p className="text-sm text-iron/70">Checking you in at {brandName}…</p>
        </div>
      )}

      {state.status === "success" && !state.alreadyCheckedIn && (
        <div className="space-y-6">
          <div className="text-6xl">🎉</div>
          <h1 className="text-3xl font-semibold">You&apos;re checked in!</h1>
          <p className="text-xl font-semibold text-sage-ink">
            +{state.pointsAwarded} points earned
          </p>
          <CheckinProgressPanel
            pointsAwarded={state.pointsAwarded}
            progress={state.progress}
          />
          <p className="max-w-xs text-sm text-iron/70">
            Your visit to {brandName} has been recorded. Come back tomorrow for another{" "}
            {state.pointsAwarded} pts.
          </p>
          <CheckinLinks brandSlug={brandSlug} brandName={brandName} primary="rewards" />
        </div>
      )}

      {state.status === "success" && state.alreadyCheckedIn && (
        <div className="space-y-6">
          <div className="text-6xl">✅</div>
          <h1 className="text-2xl font-semibold">Already checked in today</h1>
          <CheckinProgressPanel pointsAwarded={0} progress={state.progress} />
          <p className="max-w-xs text-sm text-iron/70">
            You&apos;ve already earned your visit points at {brandName} today. See you tomorrow!
          </p>
          <CheckinLinks brandSlug={brandSlug} brandName={brandName} primary="brand" />
        </div>
      )}

      {state.status === "error" && (
        <div className="space-y-6">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-2xl font-semibold">Check-in failed</h1>
          <p className="max-w-xs text-sm text-iron/70">{state.message}</p>
          <button
            onClick={() => {
              setState({ status: "resolving" });
              runCheckin();
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

function SignedOutCheckin({
  brandName,
  brandSlug,
  checkinPath,
}: {
  brandName: string;
  brandSlug: string | undefined;
  checkinPath: string;
}) {
  const loginHref = `/login?next=${encodeURIComponent(checkinPath)}`;
  const joinHref = `/signup?brand=${encodeURIComponent(brandSlug ?? "")}&next=${encodeURIComponent(checkinPath)}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Sign in or join to check in</h1>
      <p className="max-w-sm text-sm text-iron/70">
        Create a free account or sign in to earn visit points at{" "}
        <span className="text-iron/80">{brandName}</span>.
      </p>
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href={loginHref}
          className="rounded-full bg-ember px-6 py-3 text-sm font-semibold text-linen"
        >
          Sign in
        </Link>
        <Link
          href={joinHref}
          className="rounded-full border border-iron/20 px-6 py-3 text-sm font-semibold text-iron/80 hover:bg-iron/10"
        >
          Join
        </Link>
      </div>
    </div>
  );
}

/**
 * The progress moment: "+25 pts · 3 of 5 stamps · 2 more visits to your …",
 * a thin stamp bar when the brand runs a stamp card, and the balance /
 * streak / next-tier facts. Renders nothing when there is nothing to say.
 */
function CheckinProgressPanel({
  pointsAwarded,
  progress,
}: {
  pointsAwarded: number;
  progress: CheckinProgress | null;
}) {
  const headline = checkinHeadline(pointsAwarded, progress);
  const details = checkinDetails(progress);
  const card = progress?.stampCard ?? null;
  const percent = stampBarPercent(card);
  if (!headline && details.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-xs space-y-3 rounded-lg border border-iron/10 bg-parchment/40 px-4 py-3 text-left">
      {headline && <p className="text-sm font-semibold text-iron">{headline}</p>}
      {card && percent !== null && (
        <div
          role="progressbar"
          aria-label={`${card.justCompleted ? card.stampsRequired : card.stampsEarned} of ${card.stampsRequired} stamps toward ${card.rewardTitle}`}
          aria-valuemin={0}
          aria-valuemax={card.stampsRequired}
          aria-valuenow={card.justCompleted ? card.stampsRequired : card.stampsEarned}
          className="h-1.5 w-full overflow-hidden rounded-full bg-iron/10"
        >
          <div
            className="h-full rounded-full bg-sage-ink transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {details.length > 0 && (
        <p className="text-xs text-iron/70">{details.join(" · ")}</p>
      )}
    </div>
  );
}

function CheckinLinks({
  brandSlug,
  brandName,
  primary,
}: {
  brandSlug: string | undefined;
  brandName: string;
  primary: "rewards" | "brand";
}) {
  const brandHref = `/brands/${brandSlug}`;
  const rewardsHref = `/brands/${brandSlug}/rewards`;
  const solid = "rounded-full bg-ember px-6 py-3 text-sm font-semibold text-linen";
  const outline =
    "rounded-full border border-iron/20 px-6 py-3 text-sm font-medium text-iron/80 hover:bg-iron/10";
  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
      <Link href={rewardsHref} className={primary === "rewards" ? solid : outline}>
        See rewards →
      </Link>
      <Link href={brandHref} className={primary === "brand" ? solid : outline}>
        Back to {brandName}
      </Link>
    </div>
  );
}

/**
 * Resolve the session, then POST the check-in. Reports each phase through
 * `report` (resolving → checking_in → success | unauthenticated | error).
 * Lives outside the component so the auth/API flow is plain async code.
 */
async function performCheckin(
  brandSlug: string | undefined,
  report: (next: State) => void,
): Promise<void> {
  if (!brandSlug) {
    report({ status: "error", message: "Missing brand for this check-in link." });
    return;
  }

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      report({ status: "unauthenticated" });
      return;
    }

    // Only signed-in members see the real check-in spinner.
    report({ status: "checking_in" });

    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_slug: brandSlug, token: readCheckinToken() }),
    });

    if (res.status === 401) {
      report({ status: "unauthenticated" });
      return;
    }

    const data = await res.json();
    if (!res.ok) {
      report({ status: "error", message: data.error ?? "Something went wrong" });
      return;
    }

    report({
      status: "success",
      pointsAwarded: data.pointsAwarded,
      alreadyCheckedIn: data.alreadyCheckedIn,
      progress: (data.progress as CheckinProgress | null | undefined) ?? null,
    });
  } catch {
    report({ status: "error", message: "Network error — try again." });
  }
}

function subscribeNoop(): () => void {
  return () => {};
}

/** The `t` token from the scanned QR URL, or null (server render or none). */
function readCheckinToken(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("t");
}
