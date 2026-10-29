"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";

type MintResponse = {
  path: string;
  token: string | null;
  expiresAt: number | null;
  rotationSeconds: number;
  rotation: "on" | "off";
};

/**
 * Live check-in QR for the admin brand page.
 *
 * The token in the QR rotates (see lib/checkin-token.ts), so this component
 * re-fetches a freshly signed path from /api/admin/checkin-token every
 * rotationSeconds / 2 and shows a countdown to the next refresh. Printed
 * copies therefore expire within ~30 minutes unless rotation is turned off
 * with CHECKIN_TOKEN_ROTATION=off — the card says so.
 *
 * The server page passes the first signed path so the QR renders on first
 * paint without waiting for the fetch.
 */
export default function CheckinQr({
  brandSlug,
  brandName,
  initialPath,
  initialExpiresAt,
  rotationSeconds,
  rotation,
}: {
  brandSlug: string;
  brandName: string;
  /** Signed relative path from the server render (includes ?t= when configured). */
  initialPath: string;
  /** When the initial token stops being current (ms epoch), or null if static/unsigned. */
  initialExpiresAt: number | null;
  rotationSeconds: number;
  rotation: "on" | "off";
}) {
  const [path, setPath] = useState(initialPath);
  const [expiresAt, setExpiresAt] = useState<number | null>(initialExpiresAt);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Origin is only known in the browser; the server snapshot is null.
  const origin = useSyncExternalStore(subscribeNoop, readOrigin, () => null);
  // Refresh cadence: half the rotation window, so the displayed code is never
  // older than half a bucket and always inside the grace window.
  const refreshMs = (rotationSeconds * 1000) / 2;
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/checkin-token?brand=${encodeURIComponent(brandSlug)}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as MintResponse;
      setPath(data.path);
      setExpiresAt(data.expiresAt);
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "refresh failed");
    } finally {
      setNextRefreshAt(Date.now() + refreshMs);
    }
  }, [brandSlug, refreshMs]);

  // Fetch a fresh code right after mount and every refreshMs while rotation
  // is on. State is only set from the timer callbacks (after the fetch).
  useEffect(() => {
    if (rotation === "off") return;
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), refreshMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refresh, refreshMs, rotation]);

  // One-second clock for the countdown; ticks from the interval callback.
  useEffect(() => {
    if (rotation === "off") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [rotation]);

  const url = `${origin ?? "https://brand-engage-pro.vercel.app"}${path}`;
  const signed = path.includes("?t=");
  const countdown =
    rotation === "on" && signed && nextRefreshAt !== null && now !== null
      ? formatCountdown(nextRefreshAt - now)
      : null;

  return (
    <div className="glass-card space-y-4 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm uppercase tracking-wide text-iron/70">Check-in QR</p>
        {countdown && (
          <p className="text-xs tabular-nums text-iron/70" aria-live="polite">
            Refreshes in {countdown}
          </p>
        )}
      </div>
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
      {signed && rotation === "on" && (
        <p className="rounded-md border border-iron/10 bg-parchment/40 px-3 py-2 text-xs text-iron/70">
          <span className="font-semibold text-iron/80">Print this page?</span> The code
          changes every {Math.round(rotationSeconds / 60)} minutes, so a printed copy stops
          working within about {Math.round(rotationSeconds / 30)} minutes. Keep this page
          open on a screen at the counter instead. Printed codes only stay valid when
          rotation is off (CHECKIN_TOKEN_ROTATION=off).
          {expiresAt !== null && now !== null && (
            <>
              {" "}
              Current code is live until {new Date(expiresAt).toLocaleTimeString()}.
            </>
          )}
        </p>
      )}
      {signed && rotation === "off" && (
        <p className="text-xs text-iron/70">
          Rotation is off: this code is static and safe to print.
        </p>
      )}
      {fetchError && (
        <p className="text-xs text-ember" role="status">
          Could not refresh the code ({fetchError}). Showing the last one; it will retry.
        </p>
      )}
    </div>
  );
}

function subscribeNoop(): () => void {
  return () => {};
}

function readOrigin(): string | null {
  return typeof window === "undefined" ? null : window.location.origin;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
