"use client";

import { useState } from "react";
import Link from "next/link";
import DropCountdown from "@/components/drop-countdown";
import Image from "next/image";
import { RedeemForm } from "./redeem-form";
import { affordabilityCopy, rewardAffordability } from "@/components/reward-affordability";

interface RewardCardProps {
  reward: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  brandSlug: string;
  brandName: string;
  memberSlug?: string | null;
  isSignedIn?: boolean;
  /**
   * Viewer's spendable balance, fetched once by the page. null/undefined
   * (signed out, or unknown) keeps the card's original behaviour and lets
   * the redeem RPC decide.
   */
  spendablePoints?: number | null;
}

export default function RewardCardWithForm({
  reward,
  brandSlug,
  brandName,
  memberSlug,
  isSignedIn = true,
  spendablePoints = null,
}: RewardCardProps) {
  const [showForm, setShowForm] = useState(false);
  const rewardsPath = `/brands/${brandSlug}/rewards`;
  const affordability = rewardAffordability(
    reward.point_cost,
    isSignedIn ? spendablePoints : null,
  );
  const hint = affordabilityCopy(affordability);
  const cannotAfford = affordability.known && !affordability.canAfford;

  return (
    <>
      <div className="glass-card group overflow-hidden rounded-lg p-4 transition hover:border-iron/20">
        {reward.image_url && (
          <div className="relative mb-3 h-32 w-full overflow-hidden rounded-lg bg-parchment/20">
            <Image
              src={reward.image_url}
              alt={reward.title}
              fill
              className="object-cover"
            />
          </div>
        )}

        <DropCountdown reward={reward} className="mb-2" />
        <h3 className="line-clamp-2 text-sm font-semibold">{reward.title}</h3>

        {reward.description && (
          <p className="mt-1 line-clamp-2 text-xs text-iron/70">{reward.description}</p>
        )}

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-iron">{reward.point_cost.toLocaleString()}</span>
          <span className="text-xs text-iron/70">pts</span>
        </div>

        {affordability.known && (
          <div className="mt-2 space-y-1.5">
            <p
              className={`text-xs ${affordability.canAfford ? "text-sage-ink" : "text-iron/70"}`}
            >
              {hint}
            </p>
            {!affordability.canAfford && (
              <div
                role="progressbar"
                aria-label={`${(spendablePoints ?? 0).toLocaleString()} of ${reward.point_cost.toLocaleString()} points toward ${reward.title}`}
                aria-valuemin={0}
                aria-valuemax={reward.point_cost}
                aria-valuenow={Math.max(0, Math.min(reward.point_cost, spendablePoints ?? 0))}
                className="h-1 w-full overflow-hidden rounded-full bg-iron/10"
              >
                <div
                  className="h-full rounded-full bg-ember/70"
                  style={{ width: `${affordability.percent}%` }}
                />
              </div>
            )}
          </div>
        )}

        {reward.requires_tier && (
          <div className="mt-2 inline-flex rounded-full bg-amber-500/20 px-2 py-1 text-xs uppercase tracking-wide text-aurora-ink">
            {reward.requires_tier === "founder-only"
              ? "Founding"
              : reward.requires_tier === "premium"
                ? "Premium"
                : reward.requires_tier}
          </div>
        )}

        {reward.stock !== null && (
          <p className="mt-2 text-xs text-iron/70">Only {reward.stock} left</p>
        )}

        {isSignedIn ? (
          <button
            onClick={() => setShowForm(true)}
            disabled={cannotAfford}
            aria-disabled={cannotAfford}
            title={cannotAfford ? hint ?? undefined : undefined}
            className="mt-4 w-full rounded-lg bg-ember px-3 py-2 text-xs font-medium text-linen hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:opacity-50"
          >
            {cannotAfford ? "Keep earning" : "Redeem →"}
          </button>
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent(rewardsPath)}`}
            className="mt-4 block w-full rounded-lg border border-iron/20 px-3 py-2 text-center text-xs font-medium text-iron/85 hover:bg-iron/10"
          >
            Sign in to redeem →
          </Link>
        )}
      </div>

      {showForm && isSignedIn && (
        <RedeemForm
          rewardId={reward.id}
          rewardTitle={reward.title}
          pointCost={reward.point_cost}
          brandSlug={brandSlug}
          brandName={brandName}
          memberSlug={memberSlug}
          onSuccess={() => {
            setShowForm(false);
          }}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}
