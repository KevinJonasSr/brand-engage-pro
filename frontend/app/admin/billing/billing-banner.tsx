import type { BillingBanner } from "@/lib/brand-billing";

const TONE_CLASSES = {
  info: "border-sky-400/30 bg-sky-500/10 text-sky-100",
  warning: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  danger: "border-red-400/30 bg-red-500/10 text-red-100",
} as const;

export function BillingBannerNotice({ banner }: { banner: BillingBanner }) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${TONE_CLASSES[banner.tone]}`}>
      {banner.message}
    </div>
  );
}
