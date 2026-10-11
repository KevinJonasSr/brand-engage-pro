"use client";

/**
 * "✨ Suggest captions" — sister of <CommentDrafter /> from Phase 3,
 * but for image posts. Activates when an image_url is set.
 *
 * Flow:
 *   1. User uploads an image (handled by <ImageUploader />). The
 *      uploader writes the URL into a hidden input; we listen via the
 *      `imageUrl` prop the parent threads in.
 *   2. User clicks "✨ Suggest captions". We POST to /api/ai/caption-image
 *      with { imageUrl, partialBody, brandSlug }.
 *   3. We render 3 chip buttons. Click → onPick(caption) appends to
 *      the textarea via the parent's setter.
 *   4. The parent flips a hidden `caption_used=1` form field so
 *      createPostAction can write community_posts.caption_used=true.
 *
 * Failure modes (see /api/ai/caption-image):
 *   - 401 — not signed in (shouldn't happen here; composer is auth-gated)
 *   - 503 — API key missing or Anthropic down → "try again later"
 *   - 500 — generic → "try again"
 */

import { useState } from "react";

interface Props {
  imageUrl: string | null;
  partialBody: string;
  brandSlug: string;
  onPick: (caption: string) => void;
  /** Set to true when one of the chips is clicked. Parent uses this to
   *  flip the hidden caption_used input on the form. */
  onUsedChange?: (used: boolean) => void;
}

export default function CaptionSuggester({
  imageUrl,
  partialBody,
  brandSlug,
  onPick,
  onUsedChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<string[] | null>(null);

  if (!imageUrl) return null;

  async function handleSuggest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/caption-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, partialBody, brandSlug }),
      });
      const json = (await res.json()) as
        | { captions: string[] }
        | { error: string };
      if (!res.ok || !("captions" in json)) {
        throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      }
      setCaptions(json.captions);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Caption suggester failed — please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handlePick(caption: string) {
    onPick(caption);
    onUsedChange?.(true);
  }

  return (
    <div className="space-y-2 rounded-lg border border-iron/10 bg-parchment/30 p-3">
      {!captions && (
        <button
          type="button"
          onClick={handleSuggest}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-iron/15 bg-iron/10 px-3 py-1.5 text-xs text-iron hover:bg-iron/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Generating…" : "✨ Suggest captions"}
        </button>
      )}

      {error && (
        <p className="text-xs text-ember/80">{error}</p>
      )}

      {captions && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-iron/50">
            Pick one (it'll fill in your post body):
          </p>
          <div className="flex flex-col gap-1.5">
            {captions.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handlePick(c)}
                className="rounded-xl border border-iron/10 bg-parchment/40 px-3 py-2 text-left text-xs text-iron/90 transition hover:border-iron/30 hover:bg-parchment/60"
              >
                {c}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleSuggest}
            disabled={loading}
            className="text-xs text-iron/50 hover:text-iron"
          >
            {loading ? "Regenerating…" : "↻ Regenerate"}
          </button>
        </div>
      )}
    </div>
  );
}

