import { ImageResponse } from "next/og";

// iOS / iPadOS home-screen icon. 180x180 is the canonical size Safari looks
// for; other sizes get derived from PWA manifest icons.

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <svg viewBox="0 0 32 32" width="180" height="180" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D4A017" />
            <stop offset="100%" stopColor="#9B2335" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" fill="url(#g)" />
        <path d="M6 24 L6 18.5 L10.5 22 L16 9 L21.5 22 L26 18.5 L26 24 Z" fill="white" fillOpacity="0.95" />
        <rect x="5.5" y="25" width="21" height="2.5" rx="1.25" fill="white" fillOpacity="0.95" />
      </svg>
    ),
    { ...size },
  );
}
