"use client";

import type { MemberActionRow } from "@/lib/data/campaigns";
import { completeMemberActionAction } from "./cta-actions";

const KIND_ICON: Record<string, string> = {
  pre_save: "🎵",
  stream: "▶️",
  share: "🔁",
  radio_request: "📻",
  playlist_add: "➕",
  social_follow: "👥",
  custom: "✨",
};

export default function MemberCtaBlock({
  brandSlug,
  actions,
  signedIn,
}: {
  brandSlug: string;
  actions: MemberActionRow[];
  signedIn: boolean;
}) {
  if (actions.length === 0) return null;

  return (
    <section className="rounded-lg border border-aurora/30 bg-gradient-to-br from-aurora/15 via-parchment to-linen p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-iron/60">Earn points</p>
          <h2
            className="mt-1 text-xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Active campaign actions
          </h2>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {actions.map((a) => (
          <div
            key={a.id}
            className={`rounded-lg border p-4 ${
              a.completed
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-iron/10 bg-parchment/30"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-iron/10 text-lg">
                {KIND_ICON[a.kind] ?? "✨"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{a.title}</p>
                {a.description && (
                  <p className="mt-0.5 text-xs text-iron/70">{a.description}</p>
                )}
                <p className="mt-1 text-xs text-sage-ink">
                  +{a.point_value} pts on completion
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              {a.url && (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-iron/60 hover:text-iron"
                >
                  Open link ↗
                </a>
              )}
              {a.completed ? (
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-sage-ink">
                  ✓ Completed
                </span>
              ) : signedIn ? (
                <form
                  action={completeMemberActionAction}
                  onSubmit={() => {
                    // Open the URL in a new tab at the same moment we mark complete.
                    if (a.url) window.open(a.url, "_blank", "noopener,noreferrer");
                  }}
                >
                  <input type="hidden" name="action_id" value={a.id} />
                  <input type="hidden" name="brand_slug" value={brandSlug} />
                  <button className="rounded-full bg-ember px-4 py-1.5 text-xs font-semibold text-linen">
                    {a.cta_label}
                  </button>
                </form>
              ) : (
                <span className="text-xs text-iron/50">Sign in to complete</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
