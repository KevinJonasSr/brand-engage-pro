"use client";

/**
 * TagSuggester (BEP) — sister of CaptionSuggester.
 *
 * Self-contained: owns its own state, renders a hidden input named
 * `ai_suggested_tags` containing comma-separated selected tags. The
 * parent composer just renders <TagSuggester partialBody={body} … />.
 *
 * Hides itself when partialBody is < 12 chars.
 */

import { useMemo, useState } from "react";

interface Props {
  partialBody: string;
  brandSlug: string;
  /** Hidden input field name. Defaults to "ai_suggested_tags". */
  name?: string;
}

export default function TagSuggester({
  partialBody,
  brandSlug,
  name = "ai_suggested_tags",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const ready = partialBody.trim().length >= 12;
  const hiddenValue = useMemo(() => Array.from(selected).join(","), [selected]);

  async function handleSuggest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/suggest-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partialBody, brandSlug }),
      });
      const json = (await res.json()) as
        | { tags: string[] }
        | { error: string };
      if (!res.ok || !("tags" in json)) {
        throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      }
      setSuggestions(json.tags);
      setSelected(new Set(json.tags));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Tag suggester failed — please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function toggle(tag: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-iron/10 bg-parchment/30 p-3">
      <input type="hidden" name={name} value={hiddenValue} />

      {!suggestions && (
        <button
          type="button"
          onClick={handleSuggest}
          disabled={!ready || loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-iron/15 bg-iron/10 px-3 py-1.5 text-xs text-iron hover:bg-iron/15 disabled:cursor-not-allowed disabled:opacity-50"
          title={!ready ? "Type at least 12 characters first" : undefined}
        >
          {loading ? "Thinking…" : "✨ Suggest tags"}
        </button>
      )}

      {error && <p className="text-xs text-ember/80">{error}</p>}

      {suggestions && suggestions.length === 0 && (
        <p className="text-xs text-iron/70">
          No tag ideas — your post might be a bit short or off-topic for the
          existing taxonomy. You can submit without tags.
        </p>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-iron/70">
            Tap to toggle:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((tag) => {
              const on = selected.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(tag)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    on
                      ? "border-aurora/40 bg-aurora/15 text-aurora-ink"
                      : "border-iron/15 bg-iron/5 text-iron/70 hover:bg-iron/10"
                  }`}
                >
                  {on ? "✓ " : "+ "}
                  {tag}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={handleSuggest}
            disabled={loading}
            className="text-xs text-iron/70 hover:text-iron"
          >
            {loading ? "Refreshing…" : "↻ Refresh suggestions"}
          </button>
        </div>
      )}
    </div>
  );
}
