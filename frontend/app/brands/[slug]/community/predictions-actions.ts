"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin";
import { resolveAndAwardPrediction } from "@/lib/predictions/resolve";
import type {
  AwardStrategy,
  PredictionType,
  PredictionVisibility,
} from "@/lib/predictions/types";
import { notifyPredictionLaunched, notifyPredictionResolved } from "@/lib/notifications/triggers/prediction";

interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

/* ─────────────────────────── createPrediction ─────────────────────────── */

/**
 * Admin creates a prediction. Inserts a community_posts row with
 * kind='prediction' + the new prediction_* columns. For 'multi', also
 * inserts the option rows on community_poll_options.
 *
 * Form fields expected:
 *   brandSlug                    (string)
 *   prediction_type              ('multi' | 'numeric' | 'date')
 *   title                        (string)
 *   body                         (string | empty)
 *   visibility                   ('public' | 'premium' | 'founder-only')
 *   prediction_closes_at         (ISO datetime-local)
 *   points_for_correct           (integer >= 0)
 *   allow_vote_changes           (checkbox 'on'/missing)
 *   show_live_tally              (checkbox 'on'/missing)
 *   award_strategy               ('exact' | 'closest' | 'closest_no_over')
 *   options                      (multi only — repeated 'option' fields)
 *   numeric_unit                 (numeric only)
 *   numeric_tolerance            (numeric only)
 */
export async function createPredictionAction(
  formData: FormData,
): Promise<ActionResult<{ postId: string }>> {
  const adminUser = await getAdminUser();
  if (!adminUser) return { ok: false, error: "unauthorized" };

  const brandSlug = String(formData.get("brandSlug") ?? "").trim();
  const prediction_type = String(formData.get("prediction_type") ?? "") as PredictionType;
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || null;
  const visibility =
    (String(formData.get("visibility") ?? "public") as PredictionVisibility) || "public";
  const closesRaw = String(formData.get("prediction_closes_at") ?? "");
  const points_for_correct = Number(formData.get("points_for_correct") ?? "0");
  const allow_vote_changes = formData.get("allow_vote_changes") === "on";
  const show_live_tally = formData.get("show_live_tally") === "on";
  const award_strategy =
    (String(formData.get("award_strategy") ?? "closest") as AwardStrategy) || "closest";

  if (!brandSlug) return { ok: false, error: "missing_brand" };
  if (!title) return { ok: false, error: "missing_title" };
  if (!["multi", "numeric", "date"].includes(prediction_type))
    return { ok: false, error: "bad_type" };
  if (!closesRaw) return { ok: false, error: "missing_close_time" };

  const prediction_closes_at = new Date(closesRaw).toISOString();
  if (Number.isNaN(new Date(prediction_closes_at).getTime()))
    return { ok: false, error: "bad_close_time" };

  // Numeric / date specifics
  let numeric_unit: string | null = null;
  let numeric_tolerance = 0;
  if (prediction_type === "numeric") {
    numeric_unit = String(formData.get("numeric_unit") ?? "").trim() || null;
    numeric_tolerance = Number(formData.get("numeric_tolerance") ?? "0") || 0;
  }

  // Options for multi
  const optionLabels: string[] = [];
  if (prediction_type === "multi") {
    for (const v of formData.getAll("option")) {
      const label = String(v ?? "").trim();
      if (label) optionLabels.push(label);
    }
    if (optionLabels.length < 2) return { ok: false, error: "need_2_options" };
  }

  const admin = createAdminClient();

  // Insert the post row
  const { data: postRow, error: postErr } = await admin
    .from("community_posts")
    .insert({
      brand_slug: brandSlug,
      community_id: brandSlug,
      author_id: adminUser.id,
      kind: "prediction",
      prediction_type,
      title,
      body,
      visibility,
      prediction_closes_at,
      points_for_correct,
      allow_vote_changes,
      show_live_tally,
      award_strategy: prediction_type === "multi" ? "exact" : award_strategy,
      numeric_unit,
      numeric_tolerance,
    })
    .select("id")
    .single();

  if (postErr || !postRow)
    return { ok: false, error: postErr?.message ?? "insert_failed" };

  const postId = postRow.id as string;

  // Multi: insert options
  if (prediction_type === "multi" && optionLabels.length > 0) {
    const optionRows = optionLabels.map((label, idx) => ({
      post_id: postId,
      label,
      sort_order: idx,
    }));
    const { error: optErr } = await admin
      .from("community_poll_options")
      .insert(optionRows);
    if (optErr) return { ok: false, error: `options: ${optErr.message}` };
  }

  // Best-effort push to brand followers
  notifyPredictionLaunched({
    postId,
    brandSlug,
    title,
  }).catch(() => {});

  revalidatePath(`/brands/${brandSlug}`);
  revalidatePath(`/brands/${brandSlug}/community`);
  revalidatePath(`/admin/predictions`);

  return { ok: true, data: { postId } };
}

/* ─────────────────────────── votePrediction ───────────────────────────── */

/**
 * Member votes (or changes vote, if allow_vote_changes=true).
 * Upserts on (post_id, member_id) so a second call with the same member
 * just updates the prior vote — no duplicate rows.
 *
 * Form fields:
 *   postId         (uuid)
 *   option_id      (multi)
 *   numeric_value  (numeric)
 *   date_value     (date as YYYY-MM-DD)
 */
export async function votePredictionAction(
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "signed_out" };

  const postId = String(formData.get("postId") ?? "").trim();
  if (!postId) return { ok: false, error: "missing_post" };

  // Load post to gate by phase + allow_vote_changes
  const { data: post } = await supabase
    .from("community_posts")
    .select(
      "id, brand_slug, prediction_type, prediction_closes_at, resolved_at, allow_vote_changes",
    )
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { ok: false, error: "post_not_found" };
  const p = post as unknown as {
    id: string;
    brand_slug: string;
    prediction_type: PredictionType | null;
    prediction_closes_at: string | null;
    resolved_at: string | null;
    allow_vote_changes: boolean | null;
  };

  // Phase gate
  if (p.resolved_at) return { ok: false, error: "already_resolved" };
  if (
    p.prediction_closes_at &&
    new Date(p.prediction_closes_at as string).getTime() <= Date.now()
  ) {
    return { ok: false, error: "voting_closed" };
  }

  const ptype = p.prediction_type as PredictionType;
  const allowChanges = !!p.allow_vote_changes;

  // Build vote payload by type
  const payload: Record<string, unknown> = {
    post_id: postId,
    member_id: user.id,
    option_id: null,
    numeric_value: null,
    date_value: null,
  };

  if (ptype === "multi") {
    const optionId = String(formData.get("option_id") ?? "").trim();
    if (!optionId) return { ok: false, error: "missing_option" };
    payload.option_id = optionId;
  } else if (ptype === "numeric") {
    const raw = String(formData.get("numeric_value") ?? "");
    const v = Number(raw);
    if (!raw || Number.isNaN(v)) return { ok: false, error: "bad_number" };
    payload.numeric_value = v;
  } else if (ptype === "date") {
    const raw = String(formData.get("date_value") ?? "");
    if (!raw || Number.isNaN(new Date(raw).getTime()))
      return { ok: false, error: "bad_date" };
    payload.date_value = raw;
  }

  // If vote changes are NOT allowed, check for an existing vote first.
  if (!allowChanges) {
    const { data: existing } = await supabase
      .from("community_poll_votes")
      .select("post_id")
      .eq("post_id", postId)
      .eq("member_id", user.id)
      .maybeSingle();
    if (existing) return { ok: false, error: "already_voted" };
  }

  // Upsert via admin (the vote must always succeed regardless of RLS shape)
  const adminClient = createAdminClient();
  const { error: voteErr } = await adminClient
    .from("community_poll_votes")
    .upsert(payload, { onConflict: "post_id,member_id" });
  if (voteErr) return { ok: false, error: voteErr.message };

  revalidatePath(`/brands/${p.brand_slug}`);
  revalidatePath(`/brands/${p.brand_slug}/community`);

  return { ok: true };
}

/* ─────────────────────────── resolvePrediction ────────────────────────── */

/**
 * Admin resolves a prediction. Inputs depend on type — the form passes
 * the correct value(s) and an optional resolution note. We delegate the
 * heavy lifting to resolveAndAwardPrediction in lib/predictions/resolve.
 *
 * Form fields:
 *   postId
 *   correct_option_id    (multi)
 *   correct_numeric      (numeric)
 *   correct_date         (date)
 *   resolution_note      (optional)
 */
export async function resolvePredictionAction(
  formData: FormData,
): Promise<ActionResult<{ winners: number; pointsAwarded: number }>> {
  const adminUser = await getAdminUser();
  if (!adminUser) return { ok: false, error: "unauthorized" };

  const postId = String(formData.get("postId") ?? "").trim();
  if (!postId) return { ok: false, error: "missing_post" };

  const correct_option_id =
    String(formData.get("correct_option_id") ?? "").trim() || undefined;
  const correctNumericRaw = String(formData.get("correct_numeric") ?? "");
  const correct_numeric =
    correctNumericRaw !== "" && !Number.isNaN(Number(correctNumericRaw))
      ? Number(correctNumericRaw)
      : undefined;
  const correctDateRaw = String(formData.get("correct_date") ?? "").trim();
  const correct_date = correctDateRaw || undefined;
  const resolution_note =
    String(formData.get("resolution_note") ?? "").trim() || null;

  const result = await resolveAndAwardPrediction({
    postId,
    resolvedBy: adminUser.id,
    resolutionNote: resolution_note,
    correctOptionId: correct_option_id ?? undefined,
    correctNumeric: correct_numeric,
    correctDate: correct_date,
  });

  if (result.error) return { ok: false, error: result.error };

  // Best-effort push to all who voted
  const admin = createAdminClient();
  const { data: post } = await admin
    .from("community_posts")
    .select("brand_slug, title")
    .eq("id", postId)
    .maybeSingle();

  if (post) {
    const rp = post as unknown as { brand_slug: string; title: string };
    notifyPredictionResolved({
      postId,
      brandSlug: rp.brand_slug,
      title: rp.title,
      winnerMemberIds: result.winners,
    }).catch(() => {});
    revalidatePath(`/brands/${rp.brand_slug}`);
    revalidatePath(`/brands/${rp.brand_slug}/community`);
  }
  revalidatePath(`/admin/predictions`);

  return {
    ok: true,
    data: { winners: result.winners.length, pointsAwarded: result.pointsAwarded },
  };
}
