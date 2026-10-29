"use client";

import { QRCodeSVG } from "qrcode.react";

/** QR a staff phone scans to open the code's lookup page. */
export default function CodeQR({ value, size = 128 }: { value: string; size?: number }) {
  return (
    <div className="inline-flex items-center justify-center rounded-lg border border-iron/10 bg-white p-3">
      <QRCodeSVG value={value} size={size} bgColor="#ffffff" fgColor="#1E1B17" level="M" />
    </div>
  );
}
