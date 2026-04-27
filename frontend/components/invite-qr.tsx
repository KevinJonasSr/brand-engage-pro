"use client";

import { QRCodeSVG } from "qrcode.react";

export default function InviteQRCode({
  url,
  size = 180,
}: {
  url: string;
  size?: number;
}) {
  return (
    <div className="flex items-center justify-center rounded-2xl bg-white p-4">
      <QRCodeSVG
        value={url}
        size={size}
        bgColor="#ffffff"
        fgColor="#050b1f"
        level="M"
      />
    </div>
  );
}
