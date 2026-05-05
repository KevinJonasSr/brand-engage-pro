import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AwardStrategy,
  PollVote,
  PredictionType,
} from "./types";

/**
 * Pure scoring functions — given a list of votes and the correct value,
 * return the set of winning member_ids. No DB calls; same module is used
 * by the resolve action AND the admin "preview winners" feature.
 */

interface ResolveInput {
  votes: PollVote[];
  predictionType: PredictionType;
  correctOptionId: string | null;
  correctNumeric: number | null;
  correctDate: string | null;       // YYYY-MM-DD
  numericTolerance: number;
  awardStrategy: AwardStrategy;
}

export function pickWinners(input: ResolveInput): string[] {
  const { votes } = input;

  if (input.predictionType === "multi") {
    if (!input.correctOptionId) return [];
    return votes
      .filter((v) => v.option_id === input.correctOptionId)
      .map((v) => v.member_id);
  }

  if (input.predictionType === "numeric") {
    if (input.correctNumeric == null) return [];
    return resolveNumeric(
      votes,
      input.correctNumeric,
      input.numericTolerance,
      input.awardStrategy,
    );
  }

  if (input.predictionType === "date") {
    if (!input.correctDate) return [];
    return resolveDate(votes, input.correctDate, input.awardStrategy);
  }

  return [];
}

function resolveNumeric(
  votes: PollVote[],
  correct: number,
  tolerance: number,
  strategy: AwardStrategy,
): string[] {
  const guesses = votes
    .filter((v) => v.numeric_value != null)
    .map((v) => ({ memberId: v.member_id, value: v.numeric_value as number }));
  if (guesses.length === 0) return [];

  if (strategy === "exact") {
    return guesses
      .filter((g) => Math.abs(g.value - correct) <= tolerance)
      .map((g) => g.memberId);
  }

  if (strategy === "closest_no_over") {
    const eligible = guesses.filter((g) => g.value <= correct);
    if (eligible.length === 0) return [];
    const minDist = Math.min(...eligible.map((g) => correct - g.value));
    return eligible.filter((g) => correct - g.value === minDist).map((g) => g.memberId);
  }

  // closest (default)
  const minDist = Math.min(...guesses.map((g) => Math.abs(g.value - correct)));
  return guesses
    .filter((g) => Math.abs(g.value - correct) === minDist)
    .map((g) => g.memberId);
}

function resolveDate(
  votes: PollVote[],
  correctIso: string,
  strategy: AwardStrategy,
): string[] {
  const correctMs = new Date(`${correctIso}T00:00:00Z`).getTime();
  const guesses = votes
    .filter((v) => v.date_value != null)
    .map((v) => ({
      memberId: v.member_id,
      ms: new Date(`${v.date_value}T00:00:00Z`).getTime(),
    }));
  if (guesses.length === 0) return [];

  if (strategy === "exact") {
    return guesses.filter((g) => g.ms === correctMs).map((g) => g.memberId);
  }

  if (strategy === "closest_no_over") {
    const eligible = guesses.filter((g) => g.ms <= correctMs);
    if (eligible.length === 0) return [];
    const minDist = Math.min(...eligible.map((g) => correctMs - g.ms));
    return eligible.filter((g) => correctMs - g.ms === minDist).map((g) => g.memberId);
  }

  const minDist = Math.min(...guesses.map((g) => Math.abs(g.ms - correctMs)));
  return guesses
    .filter((g) => Math.abs(g.ms - correctMs) === minDist)
    .map((g) => g.memberId);
}

/**
 * Resolve and award. Idempotent via prediction_award_log unique
 * (post_id, member_id) — re-resolving doesn't double-credit.
 *
 * Steps:
 *   1. Load all votes for the prediction
 *   2. Pick winners via pure scoring above
 *   3. For each winner: insert award_log row + bump points_ledger
 *   4. Mark community_posts.resolved_at + resolved_by + resolution_note
 *
 * Returns { winners, pointsAwarded } so the caller (admin UI) can show
 * a confirmation toast.
 */
interface PredictionPostRow {
  id: string;
  brand_slug: string;
  prediction_type: PredictionType | null;
  points_for_correct: number | null;
  correct_option_id: string | null;
  correct_numeric_value: number | null;
  correct_date_value: string | null;
  numeric_tolerance: number | null;
  award_strategy: AwardStrategy | null;
  resolved_at: string | null;
}

export async function resolveAndAwardPrediction(opts: {
  postId: string;
  resolvedBy: string;
  resolutionNote?: string | null;
  /** When set, override the post's stored correct_* before resolving. */
  correctOptionId?: string | null;
  correctNumeric?: number | null;
  correctDate?: string | null;
}): Promise<{ winners: string[]; pointsAwarded: number; error?: string }> {
  const admin = createAdminClient();

  const { data: post } = await admin
    .from("community_posts")
    .select(
      "id, brand_slug, prediction_type, points_for_correct, " +
        "correct_option_id, correct_numeric_value, correct_date_value, " +
        "numeric_tolerance, award_strategy, resolved_at",
    )
    .eq("id", opts.postId)
    .maybeSingle();

  if (!post) return { winners: [], pointsAwarded: 0, error: "post_not_found" };
  const p = post as unknown as PredictionPostRow;

  // Persist any overrides the admin passed in so the post row reflects truth.
  const updates: Record<string, unknown> = {
    resolved_at: new Date().toISOString(),
    resolved_by: opts.resolvedBy,
    resolution_note: opts.resolutionNote ?? null,
  };
  if (opts.correctOptionId !== undefined) updates.correct_option_id = opts.correctOptionId;
  if (opts.correctNumeric !== undefined) updates.correct_numeric_value = opts.correctNumeric;
  if (opts.correctDate !== undefined) updates.correct_date_value = opts.correctDate;

  // Load votes
  const { data: voteRows } = await admin
    .from("community_poll_votes")
    .select("post_id, member_id, option_id, numeric_value, date_value, created_at")
    .eq("post_id", opts.postId);

  const votes = (voteRows ?? []) as PollVote[];

  const winners = pickWinners({
    votes,
    predictionType: (p.prediction_type as PredictionType) ?? "multi",
    correctOptionId:
      opts.correctOptionId !== undefined
        ? opts.correctOptionId
        : (p.correct_option_id as string | null),
    correctNumeric:
      opts.correctNumeric !== undefined
        ? opts.correctNumeric
        : (p.correct_numeric_value as number | null),
    correctDate:
      opts.correctDate !== undefined
        ? opts.correctDate
        : (p.correct_date_value as string | null),
    numericTolerance: (p.numeric_tolerance as number | null) ?? 0,
    awardStrategy: (p.award_strategy as AwardStrategy) ?? "closest",
  });

  const points = (p.points_for_correct as number | null) ?? 0;
  let pointsAwarded = 0;

  if (winners.length > 0 && points > 0) {
    // Insert award_log rows (dedupe via unique). Then bump points_ledger.
    const awardRows = winners.map((member_id) => ({
      post_id: opts.postId,
      member_id,
      points,
      metadata: { strategy: p.award_strategy ?? "closest" },
    }));
    const { data: insertedAwards } = await admin
      .from("prediction_award_log")
      .upsert(awardRows, { onConflict: "post_id,member_id", ignoreDuplicates: true })
      .select("member_id");

    const newWinners = (insertedAwards ?? []).map((r) => r.member_id as string);
    if (newWinners.length > 0) {
      const ledgerRows = newWinners.map((member_id) => ({
        member_id,
        delta: points,
        reason: "prediction_correct",
        metadata: { post_id: opts.postId },
      }));
      await admin.from("points_ledger").insert(ledgerRows);
      pointsAwarded = points * newWinners.length;
    }
  }

  await admin.from("community_posts").update(updates).eq("id", opts.postId);

  return { winners, pointsAwarded };
}
