"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleFollowAction } from "./follow-actions";

export default function FollowButton({
  brandSlug,
  initialFollowing,
}: {
  brandSlug: string;
  initialFollowing: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();

  async function handleClick() {
    // Optimistic flip so the button feels instant
    const next = !following;
    setFollowing(next);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("brand_slug", brandSlug);
      fd.set("follow", String(next));
      try {
        await toggleFollowAction(fd);
        router.refresh();
      } catch {
        setFollowing(!next);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={`rounded-full px-6 py-3 text-sm font-semibold transition disabled:opacity-50 ${
        following
          ? "border border-sage/60 bg-sage/30 text-linen backdrop-blur hover:bg-sage/40"
          : "border border-linen/30 bg-iron/30 text-linen backdrop-blur hover:bg-linen/10"
      }`}
    >
      {following ? "✓ Following" : "+ Follow"}
    </button>
  );
}
