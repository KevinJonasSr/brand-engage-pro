"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";
import RedemptionAction from "../redemption-action";
import { markPerkUsedAction } from "../actions";

/**
 * Action buttons for the staff lookup page. A reward redemption reuses the
 * queue's Fulfill / Refund buttons (same server actions); a perk gets a
 * single "Mark used" button since perks carry no points to refund.
 */
export default function CodeActions({
  kind,
  id,
  active,
}: {
  kind: "redemption" | "perk";
  id: string;
  active: boolean;
}) {
  if (!active) return null;
  if (kind === "redemption") return <RedemptionAction redemptionId={id} />;
  return <PerkAction perkId={id} />;
}

function PerkAction({ perkId }: { perkId: string }) {
  const router = useRouter();
  const [businessError, setBusinessError] = useState<string | null>(null);
  const { status, invoke, submitting } = useFormSave({
    onSuccess: () => router.refresh(),
  });

  async function handleUse() {
    if (!confirm("Mark this perk as used? This cannot be undone.")) return;
    setBusinessError(null);
    const result = await invoke(() => markPerkUsedAction(perkId));
    if (result?.error) setBusinessError(result.error);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleUse}
        disabled={submitting}
        className="rounded-lg bg-green-500/20 px-3 py-1 text-xs font-medium text-sage-ink hover:bg-green-500/30 disabled:opacity-50"
      >
        {submitting ? "…" : "Mark used"}
      </button>
      <SaveStatusIndicator status={status} className="text-xs" />
      {businessError && (
        <span className="text-xs text-ember" title={businessError}>
          ✗ {businessError}
        </span>
      )}
    </div>
  );
}
