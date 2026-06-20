import type { ActivityPulse } from "@/lib/data/activity-pulse";

/**
 * Activity Pulse strip — anonymized social-proof counts on brand pages.
 * Only renders when at least one metric is non-zero so empty states don't
 * show a blank bar.
 */
export default function ActivityPulseStrip({ pulse }: { pulse: ActivityPulse }) {
  const pills: Array<{ label: string; value: number; emoji: string }> = [
    { emoji: "📍", label: "checked in today", value: pulse.checkinsToday },
    { emoji: "🎟️", label: "RSVPs this week", value: pulse.rsvpsThisWeek },
    { emoji: "💬", label: "posts this week", value: pulse.postsThisWeek },
    { emoji: "✨", label: "new members this week", value: pulse.newFollowersThisWeek },
  ].filter((p) => p.value > 0);

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" aria-label="Recent member activity">
      {pills.map((p) => (
        <span
          key={p.label}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/70"
        >
          <span>{p.emoji}</span>
          <span className="font-semibold text-white">{p.value}</span>
          <span>{p.label}</span>
        </span>
      ))}
    </div>
  );
}
