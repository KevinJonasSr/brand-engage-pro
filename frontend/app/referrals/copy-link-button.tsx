"use client";

import { useState } from "react";

export default function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("Clipboard copy failed:", err);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-full border border-white/30 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
