"use client";

import { useState } from "react";
import Link from "next/link";
import DropCountdown from "@/components/drop-countdown";
import Image from "next/image";
import { RedeemForm } from "./redeem-form";

interface RewardCardProps {
  reward: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  brandSlug: string;
  brandName: string;
  memberSlug?: string | null;
  isSignedIn?: boolean;
}

export default function RewardCardWithForm({
  reward,
  brandSlug,
  brandName,
  memberSlug,
  isSignedIn = true,
}: RewardCardProps) {
  const [showForm, setShowForm] = useState(false);
  const rewardsPath = `/brands/${brandSlug}/rewards`;

  return (
    <>
      <div className="glass-card group overflow-hidden rounded-2xl p-4 transition hover:border-white/20">
        {reward.image_url && (
          <div className="relative mb-3 h-32 w-full overflow-hidden rounded-lg bg-black/20">
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
          <p className="mt-1 line-clamp-2 text-xs text-white/60">{reward.description}</p>
        )}

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white">{reward.point_cost.toLocaleString()}</span>
          <span className="text-xs text-white/60">pts</span>
        </div>

        {reward.requires_tier && (
          <div className="mt-2 inline-flex rounded-full bg-amber-500/20 px-2 py-1 text-xs uppercase tracking-wide text-amber-300">
            {reward.requires_tier === "founder-only"
              ? "Founding"
              : reward.requires_tier === "premium"
                ? "Premium (≈ Gold+)"
                : reward.requires_tier}
          </div>
        )}

        {reward.stock !== null && (
          <p className="mt-2 text-xs text-white/50">Only {reward.stock} left</p>
        )}

        {isSignedIn ? (
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 w-full rounded-lg bg-gradient-to-r from-aurora to-ember px-3 py-2 text-xs font-medium text-white hover:opacity-90"
          >
            Redeem →
          </button>
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent(rewardsPath)}`}
            className="mt-4 block w-full rounded-lg border border-white/20 px-3 py-2 text-center text-xs font-medium text-white/85 hover:bg-white/10"
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
