"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";

type QrPayload = {
  path: string;
  windowSeconds: number;
  refreshInMs: number;
  requireRotating: boolean;
};

/**
 * Full-screen rotating QR for a host-stand tablet. Polls the admin API
 * once per window so the code on screen matches the current bucket.
 */
export default function HostStandScreen({
  brandSlug,
  brandName,
}: {
  brandSlug: string;
  brandName: string;
}) {
  const [qr, setQr] = useState<QrPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const res = await fetch(
          `/api/admin/checkin-qr?brand=${encodeURIComponent(brandSlug)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setQr(null);
          setSecondsLeft(null);
          setError(data.error ?? "Try again.");
          timer = setTimeout(load, 15_000);
          return;
        }
        setError(null);
        setQr(data);
        const refreshInMs = Number(data.refreshInMs) || 60_000;
        setSecondsLeft(Math.max(1, Math.round(refreshInMs / 1000)));
        timer = setTimeout(load, refreshInMs);
      } catch {
        if (cancelled) return;
        setQr(null);
        setSecondsLeft(null);
        setError("Network error. Trying again.");
        timer = setTimeout(load, 15_000);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [brandSlug]);

  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsLeft((current) => (current == null ? current : Math.max(0, current - 1)));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const url =
    qr && typeof window !== "undefined" ? `${window.location.origin}${qr.path}` : "";
  const minutes = qr ? Math.max(1, Math.round(qr.windowSeconds / 60)) : 10;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-linen text-iron">
      <div className="flex items-center justify-between px-6 py-4">
        <p className="text-sm uppercase tracking-wide text-iron/70">Host stand</p>
        <Link href={`/admin/brands/${brandSlug}`} className="text-sm text-iron/70 underline">
          Exit
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-10 text-center">
        <h1 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          {brandName}
        </h1>
        {error && <p className="max-w-md text-sm text-ember">{error}</p>}
        {url && (
          <div className="rounded-lg bg-white p-6">
            <QRCodeSVG value={url} size={320} bgColor="#ffffff" fgColor="#1E1B17" level="M" />
          </div>
        )}
        {!url && !error && (
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-iron/10 border-t-aurora" />
        )}
        {qr && (
          <div className="max-w-md space-y-2 text-sm text-iron/80">
            {qr.requireRotating ? (
              <p>Scan this code to earn today&apos;s visit points. It changes every {minutes} minutes.</p>
            ) : (
              <p>
                This screen is ready. Printed posters still award visit points until you turn on
                rotating check-in in brand settings. Set this tablet up before you turn that on.
              </p>
            )}
            {secondsLeft != null && <p className="text-iron/60">New code in {secondsLeft}s</p>}
          </div>
        )}
      </div>
    </div>
  );
}
