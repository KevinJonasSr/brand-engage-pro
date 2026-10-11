"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { formatCountdown, msUntilOpen } from "@/lib/founder-perks";
import { toggleRsvpAction } from "./rsvp-actions";

const COUNTDOWN_TICK_MS = 30 * 1000;

export default function RsvpButton({
  eventId,
  brandSlug,
  initialRsvped,
  atCapacity,
  opensAt = null,
  isFounder = false,
}: {
  eventId: string;
  brandSlug: string;
  initialRsvped: boolean;
  atCapacity: boolean;
  /** When RSVPs open to non-founders. Null means open now. */
  opensAt?: string | null;
  isFounder?: boolean;
}) {
  const router = useRouter();
  const [rsvped, setRsvped] = useState(initialRsvped);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [msLeft, setMsLeft] = useState(() => msUntilOpen(opensAt));

  useEffect(() => {
    if (!opensAt) return;
    const tick = () => setMsLeft(msUntilOpen(opensAt));
    tick();
    const id = setInterval(tick, COUNTDOWN_TICK_MS);
    return () => clearInterval(id);
  }, [opensAt]);

  const inFoundersWindow = msLeft > 0;
  const heldForFounders = inFoundersWindow && !isFounder && !rsvped;

  async function handleClick() {
    const next = !rsvped;
    setRsvped(next); // optimistic
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("event_id", eventId);
      fd.set("brand_slug", brandSlug);
      fd.set("rsvp", String(next));
      const result = await toggleRsvpAction(fd);
      if (!result.ok) {
        setRsvped(!next);
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  const disabled = pending || heldForFounders || (!rsvped && atCapacity);
  const label = rsvped
    ? "✓ RSVPed"
    : heldForFounders
      ? `Opens in ${formatCountdown(msLeft)}`
      : atCapacity
        ? "Full"
        : "RSVP · +10 pts";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={`rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
          rsvped
            ? "bg-emerald-500/20 text-sage-ink hover:bg-emerald-500/30"
            : "bg-ember text-linen"
        }`}
      >
        <span suppressHydrationWarning>{label}</span>
      </button>
      {heldForFounders && (
        <p className="text-xs text-aurora-ink/80">Founders RSVP first</p>
      )}
      {inFoundersWindow && isFounder && !rsvped && (
        <p className="text-xs text-aurora-ink/80">Founder early access</p>
      )}
      {error && <p className="text-xs text-ember">{error}</p>}
    </div>
  );
}
