"use client";

import { useState } from "react";

interface Props {
  url: string;
  text?: string;
  title?: string;
}

export default function NativeShareButton({ url, text, title }: Props) {
  const [shared, setShared] = useState(false);

  async function handleShare() {
    if (typeof navigator === "undefined") return;
    // Prefer the native share sheet on supported platforms (mobile, Safari).
    if ("share" in navigator) {
      try {
        await navigator.share({
          url,
          text: text ?? "Join me — first dibs on drops, surprises, and points.",
          title: title ?? "Come hang out",
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        return;
      } catch (err) {
        // User cancelled — silent fallthrough is fine.
        if ((err as { name?: string })?.name !== "AbortError") {
          console.warn("Native share failed:", err);
        }
        return;
      }
    }
    // Fallback: copy to clipboard.
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch (err) {
      console.warn("Clipboard copy failed:", err);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
    >
      {shared ? "Shared!" : "Share"}
    </button>
  );
}
