"use client";

import { useState, type ReactNode } from "react";
import {
  anyBrandHasCoords,
  formatMiles,
  rankByDistance,
  type BrandCoords,
} from "./brand-directory-helpers";

type Status = "idle" | "locating" | "ready" | "unavailable";

/**
 * Browser-geolocation layer for /brands. The server renders every card and
 * hands them here keyed by slug; on tap we ask for the device location and
 * re-order the grid nearest-first, labelling each card with its distance.
 *
 * Graceful no-op: when no brand has coordinates the button is not rendered,
 * and when permission is denied (or geolocation is missing) the grid stays
 * in server order with a one-line note.
 */
export default function BrandDirectoryNearMe({
  coords,
  cards,
}: {
  coords: BrandCoords[];
  /** Server-rendered cards in directory order. */
  cards: Array<{ slug: string; node: ReactNode }>;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);

  const canLocate = anyBrandHasCoords(coords);

  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("ready");
      },
      () => setStatus("unavailable"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }

  function reset() {
    setOrigin(null);
    setStatus("idle");
  }

  const nodeBySlug = new Map(cards.map((c) => [c.slug, c.node]));
  let ordered: Array<{ slug: string; node: ReactNode; miles: number | null }> = cards.map(
    (c) => ({ ...c, miles: null }),
  );
  if (status === "ready" && origin) {
    // Only cards actually in this view (the server may have filtered by
    // category/genre/city) — the coords list can be a superset.
    const inView = new Set(cards.map((c) => c.slug));
    const ranked = rankByDistance(
      coords.filter((c) => inView.has(c.slug)),
      origin,
    );
    const seen = new Set<string>();
    ordered = [];
    for (const r of ranked) {
      const node = nodeBySlug.get(r.slug);
      if (!node) continue;
      seen.add(r.slug);
      ordered.push({ slug: r.slug, node, miles: r.miles });
    }
    // Brands without coordinates keep their server order after the ranked set.
    for (const c of cards) {
      if (!seen.has(c.slug)) ordered.push({ ...c, miles: null });
    }
  }

  return (
    <>
      {canLocate && (
        <div className="flex flex-wrap items-center gap-3" aria-live="polite">
          {status === "ready" ? (
            <>
              <span className="inline-flex items-center rounded-full border border-sage/60 bg-sage/30 px-3 py-1 text-xs text-iron">
                Sorted by distance
              </span>
              <button
                type="button"
                onClick={reset}
                className="text-xs text-iron/70 underline-offset-2 hover:text-iron hover:underline"
              >
                Show directory order
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={locate}
              disabled={status === "locating"}
              className="inline-flex items-center rounded-full border border-iron/10 bg-parchment/30 px-3 py-1 text-xs text-iron/70 transition hover:border-iron/30 disabled:opacity-60"
            >
              {status === "locating" ? "Finding you…" : "Use my location"}
            </button>
          )}
          {status === "unavailable" && (
            <span className="text-xs text-iron/60">
              Location unavailable — showing all brands.
            </span>
          )}
        </div>
      )}

      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {ordered.map((c) => (
          <div key={c.slug} className="flex flex-col gap-2">
            {c.node}
            {c.miles !== null && (
              <p className="px-1 text-xs uppercase tracking-[0.3em] text-iron/70">
                {formatMiles(c.miles)} away
              </p>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
