import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "../send";

/**
 * Fan an artist follows just dropped a new post. Notify every follower
 * (excluding the author themselves, since they obviously know about it).
 *
 * Called fire-and-forget from `createPostAction`. We use `Promise.all`
 * with a hard cap of 200 concurrent sends — for any artist with a larger
 * follower base, this is a v2 issue (move to a queue/cron).
 *
 * The payload is intentionally minimal: artist name + first ~80 chars of
 * the post body. Click target is the artist's community feed.
 */
export async function notifyNewPost(opts: {
  postId: string;
  brandSlug: string;
  authorId: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    // Look up the artist's display name for the title
    const { data: artist } = await admin
      .from("brands")
      .select("name, slug")
      .eq("slug", opts.brandSlug)
      .maybeSingle();
    if (!artist) return;

    // Excerpt the post body
    const { data: post } = await admin
      .from("community_posts")
      .select("body, title, kind")
      .eq("id", opts.postId)
      .maybeSingle();
    if (!post) return;

    const excerpt = String(post.body ?? post.title ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

    // Find followers who aren't the author
    const { data: follows } = await admin
      .from("member_brand_following")
      .select("member_id")
      .eq("brand_slug", opts.brandSlug);

    const fanIds = (follows ?? [])
      .map((r) => r.member_id as string)
      .filter((id) => id !== opts.authorId);

    if (fanIds.length === 0) return;

    const title = `${artist.name as string} posted`;
    const body = excerpt || "Check out the new post.";
    const url = `/brands/${opts.brandSlug}/community`;

    // Cap concurrency. 200 is a generous V1 limit — we'll move large
    // followings to a queued cron in V2.
    const MAX_CONCURRENT = 200;
    const targets = fanIds.slice(0, MAX_CONCURRENT);

    await Promise.all(
      targets.map((memberId) =>
        sendNotification({
          memberId,
          type: "new_post",
          payload: {
            title,
            body,
            url,
            tag: `new_post:${opts.postId}`,
          },
        }),
      ),
    );
  } catch (err) {
    console.warn("notifyNewPost failed (non-blocking):", err);
  }
}
