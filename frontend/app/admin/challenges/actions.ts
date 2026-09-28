"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import { awardPoints } from "@/lib/points/award";
import { createNotification } from "@/lib/data/notifications";

const WINNER_BONUS_POINTS = 200;

export async function pickWinnerAction(formData: FormData) {
  const ctx = await getAdminContext();
  if (!ctx) return;
  // Brand admins may only pick winners on their own brand's posts.
  const scope = ctx.isSuperAdmin ? null : ctx.currentCommunityId;
  if (!ctx.isSuperAdmin && !scope) return;

  const postId = String(formData.get("post_id") ?? "");
  const entryId = String(formData.get("entry_id") ?? "");
  const memberId = String(formData.get("member_id") ?? "");
  if (!postId || !entryId || !memberId) return;

  const supa = createAdminClient();

  const { data: post } = await supa
    .from("community_posts")
    .select("brand_slug, title, body")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return;
  const brandSlug = (post.brand_slug as string | null) ?? "";
  if (scope && brandSlug !== scope) return;

  // The winner must have actually entered this challenge.
  const { data: entry } = await supa
    .from("community_challenge_entries")
    .select("id")
    .eq("id", entryId)
    .eq("post_id", postId)
    .eq("member_id", memberId)
    .maybeSingle();
  if (!entry) return;

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

  // Bonus points. awardPoints writes the ledger row first (the 0059 index
  // rejects a repeat) and moves both totals atomically (0061).
  await awardPoints(supa, {
    memberId,
    delta: WINNER_BONUS_POINTS,
    source: "challenge",
    sourceRef: `challenge_winner:${postId}:${memberId}`,
    note: "Challenge winner bonus",
    ...(brandSlug ? { communityId: brandSlug } : {}),
  });

  // In-app notification for the winner — same dedup_key pattern as the
  // ledger guard, so repeated clicks never spam the member's inbox.
  const postTitle = (post.title as string | null) ?? null;
  const postBody = (post.body as string | null) ?? "";
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
