import { createAdminClient } from "@/lib/supabase/admin";
import type { PredictionVisibility } from "@/lib/predictions/types";
import { PredictionCard } from "./prediction-card";

interface Props {
  brandSlug: string;
  viewerMemberId: string | null;
  viewerTier?: PredictionVisibility;
  /** Max predictions to render. */
  limit?: number;
}

interface PredictionRow {
  id: string;
  visibility: PredictionVisibility;
  prediction_closes_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

const TIER_RANK: Record<PredictionVisibility, number> = {
  public: 0,
  premium: 1,
  "founder-only": 2,
};

/**
 * Server component. Fetches the active + recently-resolved predictions for
 * the brand, then renders one PredictionCard per post. Returns null if
 * there are no eligible predictions for this viewer (so the section header
 * doesn't render emptily).
 */
export async function BrandPredictionsSection({
  brandSlug,
  viewerMemberId,
  viewerTier = "public",
  limit = 6,
}: Props) {
  const admin = createAdminClient();

  // Pull recent predictions (open + closed-awaiting + recently resolved).
  // Sort: open first (closes_at asc), then awaiting, then most recent resolved.
  // Simplest: fetch all in last 30d, then sort client-side.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await admin
    .from("community_posts")
    .select(
      "id, visibility, prediction_closes_at, resolved_at, created_at",
    )
    .eq("brand_slug", brandSlug)
    .eq("kind", "prediction")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(50);

  const all = (rows ?? []) as unknown as PredictionRow[];

  // Visibility gate
  const visibleAtTier = all.filter(
    (p) => TIER_RANK[p.visibility] <= TIER_RANK[viewerTier],
  );
  if (visibleAtTier.length === 0) return null;

  // Sort: open (with soonest close first), then awaiting-resolution, then resolved.
  const now = Date.now();
  function bucket(p: PredictionRow): number {
    if (p.resolved_at) return 2;
    if (
      p.prediction_closes_at &&
      new Date(p.prediction_closes_at).getTime() <= now
    )
      return 1;
    return 0;
  }
  visibleAtTier.sort((a, b) => {
    const ba = bucket(a);
    const bb = bucket(b);
    if (ba !== bb) return ba - bb;
    if (ba === 0) {
      // open: closest close first
      const ta = a.prediction_closes_at
        ? new Date(a.prediction_closes_at).getTime()
        : Infinity;
      const tb = b.prediction_closes_at
        ? new Date(b.prediction_closes_at).getTime()
        : Infinity;
      return ta - tb;
    }
    if (ba === 2) {
      // resolved: most recently resolved first
      const ta = a.resolved_at ? new Date(a.resolved_at).getTime() : 0;
      const tb = b.resolved_at ? new Date(b.resolved_at).getTime() : 0;
      return tb - ta;
    }
    // awaiting: most recent first
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const top = visibleAtTier.slice(0, limit);

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h2
          className="text-sm font-semibold uppercase tracking-[0.18em] text-white/65"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Predictions
        </h2>
      </header>
      <div className="space-y-3">
        {top.map((p) => (
          <PredictionCard
            key={p.id}
            postId={p.id}
            viewerMemberId={viewerMemberId}
            viewerTier={viewerTier}
          />
        ))}
      </div>
    </section>
  );
}
