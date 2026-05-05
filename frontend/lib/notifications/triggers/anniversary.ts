import { sendNotification } from "../send";

/**
 * Push when a member crosses a tenure milestone with a brand.
 *
 * Uses the existing `drops` notification preference — anniversaries are
 * a celebratory drop-style nudge, not a separate opt-in. If we want a
 * dedicated `anniversaries` flag later we can split this out.
 */
export async function notifyAnniversary(opts: {
  memberId: string;
  brandSlug: string;
  brandName: string;
  label: string;       // "one year", "six months", etc.
  points: number;
}): Promise<void> {
  try {
    await sendNotification({
      memberId: opts.memberId,
      type: "drops",
      payload: {
        title: `🎉 ${capitalize(opts.label)} with ${opts.brandName}`,
        body:
          opts.points > 0
            ? `Thanks for sticking with us. ${opts.points} pts dropped in your wallet.`
            : `Thanks for sticking with us — here's to the next ${opts.label}.`,
        url: `/brands/${opts.brandSlug}`,
        tag: `anniversary:${opts.brandSlug}:${opts.label.replace(/\s+/g, "_")}`,
      },
    });
  } catch (err) {
    console.warn("notifyAnniversary failed (non-blocking):", err);
  }
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
