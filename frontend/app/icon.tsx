import { ImageResponse } from "next/og";

// Browser-tab favicon: the Brand Engage Pro mark used in the site header
// (app/layout.tsx) — aurora-to-ember gradient tile with the white peaks and
// bar. Keep this in sync with public/icons/*.svg and the PNGs in public/.

export const runtime = "edge";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <svg viewBox="0 0 32 32" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D4A017" />
            <stop offset="100%" stopColor="#9B2335" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#g)" />
        <path d="M6 24 L6 18.5 L10.5 22 L16 9 L21.5 22 L26 18.5 L26 24 Z" fill="white" fillOpacity="0.95" />
        <rect x="5.5" y="25" width="21" height="2.5" rx="1.25" fill="white" fillOpacity="0.95" />
      </svg>
    ),
    { ...size },
  );
}
