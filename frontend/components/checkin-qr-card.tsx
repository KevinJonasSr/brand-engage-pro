"use client";

import { QRCodeSVG } from "qrcode.react";

/**
 * Admin-facing QR card for a brand's check-in station.
 * Print or display this at the register / entrance so members can scan.
 */
export default function CheckinQrCard({
  brandSlug,
  brandName,
}: {
  brandSlug: string;
  brandName: string;
}) {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/brands/${brandSlug}/checkin`
      : `https://brand-engage-pro.vercel.app/brands/${brandSlug}/checkin`;

  return (
    <div className="glass-card space-y-4 p-6">
      <p className="text-sm uppercase tracking-wide text-white/60">Check-in QR</p>
      <p className="text-xs text-white/50">
        Display this at your register or entrance. Members scan to earn{" "}
        <span className="text-emerald-300">+25 pts</span> per visit (once per day).
      </p>
      <div className="flex justify-center rounded-2xl bg-white p-5">
        <QRCodeSVG
          value={url}
          size={200}
          bgColor="#ffffff"
          fgColor="#050b1f"
          level="M"
        />
      </div>
      <p className="text-center text-xs text-white/40 font-mono break-all">{url}</p>
      <p className="text-center text-xs font-semibold text-white/70">
        Scan to check in to {brandName}
      </p>
    </div>
  );
}
