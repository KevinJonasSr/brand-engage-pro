import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "../send";

/**
 * Push when a prediction launches — fans of the brand get a nudge.
 * Honors the `notify_drops` preference flag (we treat predictions as
 * a drop-style alert; cleanest reuse of existing prefs).
 */
export async function notifyPredictionLaunched(opts: {
  postId: string;
  brandSlug: string;
  title: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: brand }, { data: follows }] = await Promise.all([
      admin.from("brands").select("name").eq("slug", opts.brandSlug).maybeSingle(),
      admin
        .from("member_brand_following")
        .select("member_id")
        .eq("brand_slug", opts.brandSlug),
    ]);
    if (!brand) return;

    const memberIds = (follows ?? []).map((r) => r.member_id as string);
    if (memberIds.length === 0) return;

    const MAX = 200;
    await Promise.all(
      memberIds.slice(0, MAX).map((memberId) =>
        sendNotification({
          memberId,
          type: "drops",
          payload: {
            title: `${brand.name as string} — new prediction`,
            body: opts.title,
            url: `/brands/${opts.brandSlug}#prediction-${opts.postId}`,
            tag: `prediction_launched:${opts.postId}`,
          },
        }),
      ),
    );
  } catch (err) {
    console.warn("notifyPredictionLaunched failed (non-blocking):", err);
  }
}

/**
 * Push when a prediction resolves. Winners get a "you were right" message;
 * non-winners get the answer reveal. Both opt-in via `notify_drops`.
 */
export async function notifyPredictionResolved(opts: {
  postId: string;
  brandSlug: string;
  title: string;
  winnerMemberIds: string[];
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: brand }, { data: voteRows }] = await Promise.all([
      admin.from("brands").select("name").eq("slug", opts.brandSlug).maybeSingle(),
      admin
        .from("community_poll_votes")
        .select("member_id")
        .eq("post_id", opts.postId),
    ]);
    if (!brand) return;

    const allVoters = (voteRows ?? []).map((r) => r.member_id as string);
    if (allVoters.length === 0) return;

    const winnerSet = new Set(opts.winnerMemberIds);
    const url = `/brands/${opts.brandSlug}#prediction-${opts.postId}`;

    const MAX = 200;
    await Promise.all(
      allVoters.slice(0, MAX).map((memberId) =>
        sendNotification({
          memberId,
          type: "drops",
          payload: winnerSet.has(memberId)
            ? {
                title: `🎉 You were right!`,
                body: `${brand.name as string} — ${opts.title}. Points are in your wallet.`,
                url,
                tag: `prediction_resolved:${opts.postId}:winner`,
              }
            : {
                title: `Result is in`,
                body: `${brand.name as string} — ${opts.title}`,
                url,
                tag: `prediction_resolved:${opts.postId}`,
              },
        }),
      ),
    );
  } catch (err) {
    console.warn("notifyPredictionResolved failed (non-blocking):", err);
  }
}
