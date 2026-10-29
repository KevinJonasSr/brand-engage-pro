"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export interface CardBrand {
  communityId: string;
  brandName: string;
  tierSlug: string;
  tierName: string;
  tierIcon: string;
  isFounder: boolean;
  /** Points to the next tier within this brand, null at the top. */
  nextTierName: string | null;
  pointsToNext: number | null;
  /** 0–100 progress toward the next tier, null at the top. */
  progressPct: number | null;
}

interface MemberCardProps {
  displayName: string;
  /** Short, human-readable id shown under the QR. */
  memberRef: string;
  spendablePoints: number;
  lifetimePoints: number;
  brands: CardBrand[];
  /** URL encoded in the QR (the member's public profile). */
  qrValue: string;
}

/**
 * The card a member shows at the counter. One card per joined brand; when
 * there is more than one, a switcher above the card picks which brand's
 * tier to show. Points are the member's wallet (one ledger across brands),
 * so they do not change with the switcher.
 */
export default function MemberCard({
  displayName,
  memberRef,
  spendablePoints,
  lifetimePoints,
  brands,
  qrValue,
}: MemberCardProps) {
  const [index, setIndex] = useState(0);
  const brand = brands[Math.min(index, Math.max(0, brands.length - 1))] ?? null;

  return (
    <div className="space-y-3">
      {brands.length > 1 && (
        <div role="tablist" aria-label="Brand" className="flex flex-wrap gap-2">
          {brands.map((b, i) => {
            const selected = i === index;
            return (
              <button
                key={b.communityId}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => setIndex(i)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  selected
                    ? "bg-iron text-linen"
                    : "border border-iron/15 text-iron/70 hover:bg-iron/5"
                }`}
              >
                {b.brandName}
              </button>
            );
          })}
        </div>
      )}

      <div
        className="relative overflow-hidden rounded-lg border border-iron/10 p-6 shadow-glass sm:p-8"
        style={{
          background:
            "linear-gradient(135deg, rgba(212,160,23,0.28) 0%, #f5efe4 50%, rgba(155,35,53,0.14) 100%)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-aurora/20 blur-3xl"
        />

        <div className="relative space-y-6">
          {/* Brand + tier */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-xs uppercase tracking-[0.3em] text-iron/70">
                {brand?.brandName ?? "Brand Engage Pro"}
              </p>
              <p className="mt-2 truncate text-2xl font-semibold">{displayName}</p>
              <p className="mt-0.5 text-xs text-iron/60">Show this card at the counter</p>
            </div>
            {brand && (
              <div className="shrink-0 text-right">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-iron/10 px-3 py-1 text-sm font-semibold">
                  <span className="text-base" aria-hidden>
                    {brand.tierIcon}
                  </span>
                  {brand.tierName}
                </span>
                {brand.isFounder && (
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-ember">
                    Founder
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Points + QR */}
          <div className="flex items-end justify-between gap-6">
            <div className="space-y-4">
              <div>
                <p
                  className="text-5xl font-semibold tabular-nums leading-none"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {spendablePoints.toLocaleString()}
                </p>
                <p className="mt-1 text-sm text-iron/70">points to spend</p>
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums leading-none">
                  {lifetimePoints.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-iron/70">lifetime points</p>
              </div>
            </div>
            <div className="shrink-0 text-center">
              <div className="inline-flex rounded-lg border border-iron/10 bg-white p-2">
                <QRCodeSVG value={qrValue} size={112} bgColor="#ffffff" fgColor="#1E1B17" level="M" />
              </div>
              <p className="mt-1 font-mono text-[11px] tracking-widest text-iron/60">{memberRef}</p>
            </div>
          </div>

          {/* Progress to next tier for the selected brand */}
          {brand?.nextTierName && brand.pointsToNext != null && brand.progressPct != null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-iron/70">
                <span>{brand.tierName}</span>
                <span>{brand.nextTierName}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-iron/10">
                <div
                  className="h-full rounded-full bg-ember transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, brand.progressPct))}%` }}
                />
              </div>
              <p className="text-xs text-iron/70">
                {brand.pointsToNext.toLocaleString()} pts to {brand.nextTierName}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
