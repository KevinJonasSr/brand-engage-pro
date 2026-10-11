"use client";

import { QRCodeSVG } from "qrcode.react";

/**
 * Admin-facing QR card for a brand's check-in station.
 * Print or display this at the register / entrance so members can scan.
 */
export default function CheckinQrCard({
  brandName,
  checkinPath,
}: {
  brandName: string;
  /** Relative check-in path, signed on the server (includes ?t= when configured). */
  checkinPath: string;
}) {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}${checkinPath}`
      : `https://brand-engage-pro.vercel.app${checkinPath}`;

  return (
    <div className="glass-card space-y-4 p-6">
      <p className="text-sm uppercase tracking-wide text-iron/70">Check-in QR</p>
      <p className="text-xs text-iron/70">
        Display this at your register or entrance. Members scan to earn{" "}
        <span className="text-sage-ink">+25 pts</span> per visit (once per day).
      </p>
      <div className="flex justify-center rounded-lg bg-iron p-5">
        <QRCodeSVG
          value={url}
          size={200}
          bgColor="#ffffff"
          fgColor="#1E1B17"
          level="M"
        />
      </div>
      <p className="text-center text-xs text-iron/70 font-mono break-all">{url}</p>
      <p className="text-center text-xs font-semibold text-iron/70">
        Scan to check in to {brandName}
      </p>
    </div>
  );
}
