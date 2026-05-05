import { createAdminClient } from "@/lib/supabase/admin";
import type { PollOption, PollVote, PredictionTally, PredictionType } from "./types";

/**
 * Live tally — computed per request. Cheap on small datasets (single
 * prediction = at most a few hundred votes). If a prediction goes viral
 * with thousands of votes, materialize as a row in a `prediction_tally_cache`
 * table refreshed by a cron.
 *
 * Returns null on error (lib code never throws to the UI).
 */
export async function gatherPredictionTally(
  postId: string,
): Promise<PredictionTally | null> {
  try {
    const admin = createAdminClient();

    const [{ data: post }, { data: voteRows }, { data: optionRows }] =
      await Promise.all([
        admin
          .from("community_posts")
          .select("id, prediction_type")
          .eq("id", postId)
          .maybeSingle(),
        admin
          .from("community_poll_votes")
          .select("post_id, member_id, option_id, numeric_value, date_value, created_at")
          .eq("post_id", postId),
        admin
          .from("community_poll_options")
          .select("id, post_id, label, sort_order")
          .eq("post_id", postId)
          .order("sort_order"),
      ]);

    if (!post) return null;
    const p = post as unknown as { id: string; prediction_type: PredictionType | null };

    const votes = (voteRows ?? []) as PollVote[];
    const options = (optionRows ?? []) as PollOption[];
    const total = votes.length;
    const type = (p.prediction_type as PredictionType) ?? "multi";

    const empty: PredictionTally = {
      total_votes: total,
      by_option: [],
      numeric_summary: null,
      date_buckets: [],
    };

    if (total === 0) return empty;

    if (type === "multi") {
      const counts = new Map<string, number>();
      for (const v of votes) {
        if (!v.option_id) continue;
        counts.set(v.option_id, (counts.get(v.option_id) ?? 0) + 1);
      }
      const by_option = options.map((o) => {
        const c = counts.get(o.id) ?? 0;
        return {
          option_id: o.id,
          label: o.label,
          count: c,
          pct: total > 0 ? Math.round((c / total) * 100) : 0,
        };
      });
      return { ...empty, by_option };
    }

    if (type === "numeric") {
      const nums = votes
        .map((v) => v.numeric_value)
        .filter((n): n is number => n != null);
      if (nums.length === 0) return empty;
      const sorted = [...nums].sort((a, b) => a - b);
      const sum = nums.reduce((a, b) => a + b, 0);
      const median =
        sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];
      return {
        ...empty,
        numeric_summary: {
          min: sorted[0],
          max: sorted[sorted.length - 1],
          mean: Math.round((sum / nums.length) * 100) / 100,
          median,
        },
      };
    }

    if (type === "date") {
      const buckets = new Map<string, number>();
      for (const v of votes) {
        if (!v.date_value) continue;
        buckets.set(v.date_value, (buckets.get(v.date_value) ?? 0) + 1);
      }
      const date_buckets = Array.from(buckets.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return { ...empty, date_buckets };
    }

    return empty;
  } catch (err) {
    console.warn("gatherPredictionTally failed (non-blocking):", err);
    return null;
  }
}
