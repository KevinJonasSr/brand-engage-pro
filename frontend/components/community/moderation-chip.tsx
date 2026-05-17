/**
 * ModerationChip (BEP) — identical to FE component, member-friendly copy.
 */

interface Props {
  message: string | null;
}

export default function ModerationChip({ message }: Props) {
  return (
    <div
      className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3 text-amber-100"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-base leading-tight">🛡️</span>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-200/80">
            Hidden from others
          </p>
          <p className="text-xs text-amber-50/90">
            {message
              ? message
              : "Your post was hidden by our automated moderation. We're still preparing a detailed reason — check back in a few minutes."}
          </p>
        </div>
      </div>
    </div>
  );
}
