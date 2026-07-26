"use client";

/**
 * AltTextSuggester (BEP) — auto-generates alt text on image upload.
 * Mirrors FE component; uses brandSlug prop.
 */

import { useEffect, useState } from "react";

interface Props {
  imageUrl: string | null;
  brandSlug: string;
  partialBody?: string;
  name?: string;
}

export default function AltTextSuggester({
  imageUrl,
  brandSlug,
  partialBody = "",
  name = "image_alt",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altText, setAltText] = useState("");
  const [aiGenerated, setAiGenerated] = useState(false);

  useEffect(() => {
    if (!imageUrl) {
      setAltText("");
      setError(null);
      setAiGenerated(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/ai/alt-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl, brandSlug, partialBody }),
    })
      .then(async (res) => {
        const json = (await res.json()) as
          | { altText: string }
          | { error: string };
        if (cancelled) return;
        if (!res.ok || !("altText" in json)) {
          throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
        }
        if (json.altText) {
          setAltText(json.altText);
          setAiGenerated(true);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : "Couldn't generate alt text — please type your own.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, brandSlug]);

  if (!imageUrl) return null;

  return (
    <div className="space-y-1.5 rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] uppercase tracking-wide text-white/50">
          Alt text {aiGenerated && <span className="text-aurora">· AI-suggested, edit if you'd like</span>}
        </label>
        {loading && <span className="text-[10px] text-white/40">Thinking…</span>}
      </div>
      <input
        type="text"
        name={name}
        value={altText}
        onChange={(e) => {
          setAltText(e.target.value);
          if (aiGenerated) setAiGenerated(false);
        }}
        maxLength={200}
        placeholder={
          loading
            ? "Generating alt text…"
            : "Describe the image for screen readers"
        }
        className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
      />
      {error && (
        <p className="text-[10px] text-rose-300/70">
          {error} You can type your own description above.
        </p>
      )}
    </div>
  );
}
