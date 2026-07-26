/**
 * <PickedForYou /> (BEP) — server component, member-facing copy.
 */

import Link from "next/link";
import { getPickedForYou, type PickedPost } from "@/lib/personal-feed/compute";

interface Props {
  memberId: string;
  brandSlug: string;
  limit?: number;
}

export default async function PickedForYou({
  memberId,
  brandSlug,
  limit = 3,
}: Props) {
  const posts = await getPickedForYou({ memberId, brandSlug, limit });
  if (posts.length === 0) return null;

  const hasTagMatch = posts.some((p) => p.reason === "tag-match");
  const headerLabel = hasTagMatch ? "Picked for you" : "You might have missed";

  return (
    <section
      aria-label={headerLabel}
      className="space-y-3 rounded-2xl border border-aurora/20 bg-gradient-to-br from-aurora/10 via-black/30 to-ember/5 p-4"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-base">✨</span>
        <h2 className="text-sm font-semibold text-white">{headerLabel}</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {posts.map((p) => (
          <PickedCard key={p.id} post={p} />
        ))}
      </div>
    </section>
  );
}

function PickedCard({ post }: { post: PickedPost }) {
  const preview = previewText(post);
  return (
    <Link
      href={`#post-${post.id}`}
      className="block rounded-xl border border-white/10 bg-black/40 p-3 transition hover:border-white/30 hover:bg-black/60"
    >
      {post.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.image_url}
          alt={post.image_alt ?? ""}
          className="mb-2 aspect-video w-full rounded-lg object-cover"
          loading="lazy"
        />
      )}
      {post.title && (
        <p className="line-clamp-1 text-xs font-semibold text-white">
          {post.title}
        </p>
      )}
      <p className="line-clamp-3 text-xs text-white/70">{preview}</p>
      {post.tags && post.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {post.tags.slice(0, 2).map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] uppercase tracking-wide text-white/60"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

function previewText(p: PickedPost): string {
  const body = p.body ?? "";
  if (body.length <= 140) return body;
  return body.slice(0, 137).trimEnd() + "…";
}
