"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin";
import { createNotification } from "@/lib/data/notifications";

const WINNER_BONUS_POINTS = 200;

export async function pickWinnerAction(formData: FormData) {
  const admin = await getAdminUser();
  if (!admin) return;
  const postId = String(formData.get("post_id") ?? "");
  const entryId = String(formData.get("entry_id") ?? "");
  const memberId = String(formData.get("member_id") ?? "");
  if (!postId || !entryId || !memberId) return;

  const supa = createAdminClient();

  // Record the winner via campaign_items (item_kind='challenge_winner'), guard against dupes.
  const { data: existing } = await supa
    .from("campaign_items")
    .select("id")
    .eq("item_kind", "challenge_winner")
    .eq("ref_id", postId)
    .limit(1);
  if (existing && existing.length > 0) return;

  await supa.from("campaign_items").insert({
    campaign_id: null,
    item_kind: "challenge_winner",
    ref_id: postId,
    metadata: { entry_id: entryId, member_id: memberId },
  });

  // Award bonus points via ledger; idempotent guard.
  const refId = `challenge_winner:${postId}:${memberId}`;
  const { data: ledgerExists } = await supa
    .from("points_ledger")
    .select("id")
    .eq("source_ref", refId)
    .limit(1);
  if (!ledgerExists || ledgerExists.length === 0) {
    await supa.from("points_ledger").insert({
      member_id: memberId,
      delta: WINNER_BONUS_POINTS,
      source: "challenge",
      source_ref: refId,
      note: "Challenge winner bonus",
    });
    // Fetch + update member total_points (trigger will auto-promote tier)
    const { data: memberRow } = await supa
      .from("members")
      .select("total_points")
      .eq("id", memberId)
      .maybeSingle();
    await supa
      .from("members")
      .update({ total_points: (memberRow?.total_points ?? 0) + WINNER_BONUS_POINTS })
      .eq("id", memberId);
  }

  // In-app notification for the winner — same dedup_key pattern as the
  // ledger guard, so repeated clicks never spam the member's inbox.
  const { data: post } = await supa
    .from("community_posts")
    .select("brand_slug, title, body")
    .eq("id", postId)
    .maybeSingle();
  const brandSlug = (post?.brand_slug as string | null) ?? "";
  const postTitle = (post?.title as string | null) ?? null;
  const postBody = (post?.body as string | null) ?? "";
  await createNotification({
    memberId: memberId,
    kind: "challenge_winner",
    title: "🎉 You won the challenge!",
    body:
      `${postTitle ?? (postBody.slice(0, 60) || "Your entry")} — +${WINNER_BONUS_POINTS} bonus points.`,
    url: brandSlug ? `/brands/${brandSlug}/community` : "/rewards",
    icon: "🏆",
    dedupKey: `challenge_winner:${postId}:${memberId}`,
  });

  revalidatePath("/admin/challenges");
  revalidatePath("/admin/community");
}
