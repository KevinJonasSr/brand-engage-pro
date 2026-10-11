import Link from "next/link";
import { resolveBrandAccent, withAlpha } from "@/lib/brand-accent";

interface PremiumPaywallProps {
  /** What the user is trying to see. Used in the headline copy. */
  feature: string;
  /** Optional longer description of what they'll get. */
  description?: string;
  /** Community slug — the join link is scoped to this community. */
  communityId?: string;
  /** Community accent colors. Falls back to the default aurora→ember gradient. */
  accentFrom?: string | null;
  accentTo?: string | null;
  /** Reason from canAccess() — drives the CTA text and copy. */
  reason?: "signed-out" | "needs-premium" | "needs-founder";
  /** Compact variant for inline use (e.g. inside a post card). */
  compact?: boolean;
}

/**
 * The shared locked-state UI. Whenever a piece of content is gated behind
 * Premium or Founder-only access, wrap it (or replace it) with this component
 * so every paywall across the app looks and behaves the same.
 *
 * The component is purely presentational — it assumes the caller already
 * decided the viewer can't see the content. Use canAccess() from
 * lib/entitlements.ts to make that call upstream.
 */
export default function PremiumPaywall({
  feature,
  description,
  communityId,
  accentFrom,
  accentTo,
  reason = "needs-premium",
  compact = false,
}: PremiumPaywallProps) {
  const palette = resolveBrandAccent(accentFrom, accentTo);
  const solid = { backgroundColor: palette.accent, color: palette.onAccent };
  // Premium sales are closed (brands pay, guests join free), so the only
  // CTA left is the free join for signed-out viewers.
  const signupHref = `/signup${communityId ? `?ref=${encodeURIComponent(communityId)}` : ""}`;
  const ctaHref = reason === "signed-out" ? signupHref : null;
  const ctaLabel = "Join free";

  const featureCopy =
    reason === "needs-founder"
      ? `${feature} is for Founders only`
      : `${feature} is for select members`;

  if (compact) {
    return (
      <div
        className="flex items-center gap-3 rounded-lg border border-iron/10 bg-parchment/40 px-4 py-3 text-sm"
        style={{ borderColor: withAlpha(palette.accent, 0.2) }}
      >
        <span
          className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-base"
          style={solid}
        >
          {reason === "needs-founder" ? "👑" : "🔒"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-iron">{featureCopy}</p>
          {description && (
            <p className="truncate text-xs text-iron/55">{description}</p>
          )}
        </div>
        {ctaHref && (
          <Link
            href={ctaHref}
            className="flex-none rounded-full px-3 py-1.5 text-xs font-semibold shadow-glass transition hover:brightness-110"
            style={solid}
          >
            Join
          </Link>
        )}
      </div>
    );
  }

  return (
    <section
      className="relative overflow-hidden rounded-lg border border-iron/10 bg-parchment/40 p-6"
      style={{ borderColor: withAlpha(palette.accent, 0.2), backgroundColor: withAlpha(palette.accent, 0.04) }}
    >
      <div className="relative z-10 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-iron/90">
              {reason === "needs-founder"
                ? "Founders only — the free first 100 who join"
                : "Members only"}
            </p>
            <h3 className="mt-2 text-lg font-bold text-iron">{featureCopy}</h3>
            {description && (
              <p className="mt-2 text-sm text-iron/75">{description}</p>
            )}
          </div>
          <span className="text-3xl flex-none">
            {reason === "needs-founder" ? "👑" : "🔒"}
          </span>
        </div>

        <div className="space-y-2">
          {reason === "needs-founder" ? (
            <>
              <p className="text-xs text-iron/60">
                Founding is a free first-100 badge. Founders get:
              </p>
              <ul className="space-y-1 text-xs text-iron/70">
                <li>✓ Exclusive founder-only posts & events</li>
                <li>✓ Direct support of your favorite brand</li>
                <li>✓ Lifetime founder status & badge</li>
              </ul>
            </>
          ) : (
            <>
              <p className="text-xs text-iron/60">
                Brands pay, guests join free. Join to earn points toward every reward.
              </p>
            </>
          )}
        </div>

        {ctaHref && (
          <Link
            href={ctaHref}
            className="inline-block rounded-full px-5 py-2 text-sm font-semibold shadow-glass transition hover:brightness-110"
            style={solid}
          >
            {ctaLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
