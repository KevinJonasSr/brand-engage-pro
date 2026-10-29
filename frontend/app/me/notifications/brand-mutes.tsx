"use client";

import { useState, useTransition } from "react";
import type { BrandPref, SetBrandMuted } from "./prefs";

export const BRAND_MUTE_COPY =
  "Muted brands don't send you posts, drops or predictions. You'll still get your own RSVP reminders and rewards.";

/**
 * "Brands" section of /me/notifications: one row per followed brand with a
 * mute switch. Each flip saves immediately through `setBrandMuted` (passed
 * in from the page as an inline Server Function) and rolls back on error.
 */
export function BrandMutes({
  brands,
  setBrandMuted,
}: {
  brands: BrandPref[];
  setBrandMuted: SetBrandMuted;
}) {
  const [muted, setMuted] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(brands.map((b) => [b.slug, b.muted])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function flip(slug: string) {
    const next = !muted[slug];
    setMuted((m) => ({ ...m, [slug]: next }));
    setError(null);
    setBusy(slug);
    startTransition(async () => {
      try {
        const res = await setBrandMuted(slug, next);
        if ("error" in res) {
          setMuted((m) => ({ ...m, [slug]: !next }));
          setError(res.error);
        }
      } catch {
        setMuted((m) => ({ ...m, [slug]: !next }));
        setError("Could not update that brand. Please try again.");
      } finally {
        setBusy((b) => (b === slug ? null : b));
      }
    });
  }

  return (
    <div>
      <h3 className="mb-2 text-xs uppercase tracking-widest text-iron/70">
        Brands
      </h3>
      <div className="rounded-xl border border-iron/10 bg-iron/[0.02] p-4">
        <p className="text-sm text-iron/70">{BRAND_MUTE_COPY}</p>

        {brands.length === 0 ? (
          <p className="mt-3 text-sm text-iron/70">
            You aren&apos;t following any brands yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-iron/10">
            {brands.map((b) => {
              const isMuted = !!muted[b.slug];
              const pending = busy === b.slug;
              return (
                <li key={b.slug}>
                  <label
                    className={
                      "flex items-center gap-4 py-3 transition " +
                      (pending ? "opacity-60" : "cursor-pointer")
                    }
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{b.name}</div>
                      <p className="mt-0.5 text-sm text-iron/70">
                        {isMuted ? "Muted" : "Notifications on"}
                      </p>
                    </div>
                    <span className="shrink-0">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={isMuted}
                        disabled={pending}
                        onChange={() => flip(b.slug)}
                        aria-label={`Mute ${b.name}`}
                      />
                      <span
                        className={
                          "block h-6 w-11 rounded-full transition " +
                          (isMuted ? "bg-iron" : "bg-iron/15")
                        }
                      >
                        <span
                          className={
                            "block h-5 w-5 translate-y-0.5 rounded-full transition " +
                            (isMuted
                              ? "translate-x-[22px] bg-linen"
                              : "translate-x-0.5 bg-iron")
                          }
                        />
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {error && <p className="mt-3 text-sm text-ember">{error}</p>}
      </div>
    </div>
  );
}
