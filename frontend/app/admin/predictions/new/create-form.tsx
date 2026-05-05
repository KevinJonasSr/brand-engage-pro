"use client";

import { useState, useTransition } from "react";
import { createPredictionAction } from "@/app/brands/[slug]/community/predictions-actions";
import type {
  AwardStrategy,
  PredictionSuggestion,
  PredictionType,
  PredictionVisibility,
} from "@/lib/predictions/types";

interface BrandOption {
  slug: string;
  name: string;
}

interface Props {
  brands: BrandOption[];
}

const TYPE_LABELS: Record<PredictionType, string> = {
  multi: "Multiple choice",
  numeric: "Numeric guess",
  date: "Date guess",
};

const VISIBILITY_LABELS: Record<PredictionVisibility, string> = {
  public: "Public — anyone",
  premium: "Premium tier+",
  "founder-only": "Founder tier only",
};

const STRATEGY_LABELS: Record<AwardStrategy, string> = {
  closest: "Closest wins (default)",
  closest_no_over: "Closest without going over (Price-Is-Right)",
  exact: "Exact match (within tolerance)",
};

function defaultClosesAt(): string {
  // 72 hours from now, formatted for <input type="datetime-local">
  const d = new Date(Date.now() + 72 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export function CreatePredictionForm({ brands }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [brandSlug, setBrandSlug] = useState(brands[0]?.slug ?? "");
  const [predictionType, setPredictionType] = useState<PredictionType>("multi");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<PredictionVisibility>("public");
  const [closesAt, setClosesAt] = useState(defaultClosesAt());
  const [points, setPoints] = useState(50);
  const [allowVoteChanges, setAllowVoteChanges] = useState(true);
  const [showLiveTally, setShowLiveTally] = useState(true);
  const [awardStrategy, setAwardStrategy] = useState<AwardStrategy>("closest");

  // Multi-specific
  const [options, setOptions] = useState<string[]>(["", ""]);

  // Numeric-specific
  const [numericUnit, setNumericUnit] = useState("");
  const [numericTolerance, setNumericTolerance] = useState(0);

  // AI suggestions
  const [topicSeed, setTopicSeed] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<PredictionSuggestion[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  function addOption() {
    setOptions((prev) => (prev.length >= 8 ? prev : [...prev, ""]));
  }

  function removeOption(idx: number) {
    setOptions((prev) =>
      prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx),
    );
  }

  function updateOption(idx: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  }

  async function fetchSuggestions() {
    if (!brandSlug) {
      setSuggestError("Pick a brand first");
      return;
    }
    setSuggesting(true);
    setSuggestError(null);
    setSuggestions([]);
    try {
      const res = await fetch("/api/ai/suggest-predictions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brandSlug,
          types: [predictionType],
          topicSeed: topicSeed.trim() || null,
        }),
      });
      const data = (await res.json()) as { suggestions?: PredictionSuggestion[] };
      const list = data.suggestions ?? [];
      if (list.length === 0) {
        setSuggestError("Couldn't generate suggestions — try again or refine the topic.");
      }
      setSuggestions(list);
    } catch (e) {
      setSuggestError("AI request failed — try again.");
    } finally {
      setSuggesting(false);
    }
  }

  function applySuggestion(s: PredictionSuggestion) {
    setPredictionType(s.prediction_type);
    setTitle(s.title);
    setBody(s.body ?? "");
    if (s.suggested_close_in_hours) {
      const d = new Date(Date.now() + s.suggested_close_in_hours * 60 * 60 * 1000);
      d.setSeconds(0, 0);
      const tz = d.getTimezoneOffset() * 60_000;
      setClosesAt(new Date(d.getTime() - tz).toISOString().slice(0, 16));
    }
    if (s.suggested_points) setPoints(s.suggested_points);
    if (s.suggested_strategy) setAwardStrategy(s.suggested_strategy);
    if (s.prediction_type === "numeric") {
      if (s.numeric_unit) setNumericUnit(s.numeric_unit);
    }
    const maybeOpts = (s as unknown as { options?: string[] }).options;
    if (
      s.prediction_type === "multi" &&
      Array.isArray(maybeOpts) &&
      maybeOpts.length >= 2
    ) {
      setOptions(maybeOpts.slice(0, 8));
    }
    setSuggestions([]);
    // Scroll to top of the form
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (!brandSlug) return setError("Pick a brand.");
    if (!title.trim()) return setError("Title is required.");
    if (!closesAt) return setError("Set a close time.");
    if (predictionType === "multi") {
      const cleaned = options.map((o) => o.trim()).filter(Boolean);
      if (cleaned.length < 2) return setError("Add at least 2 options.");
    }

    const fd = new FormData();
    fd.set("brandSlug", brandSlug);
    fd.set("prediction_type", predictionType);
    fd.set("title", title.trim());
    fd.set("body", body.trim());
    fd.set("visibility", visibility);
    fd.set("prediction_closes_at", closesAt);
    fd.set("points_for_correct", String(points));
    if (allowVoteChanges) fd.set("allow_vote_changes", "on");
    if (showLiveTally) fd.set("show_live_tally", "on");
    fd.set("award_strategy", awardStrategy);

    if (predictionType === "multi") {
      for (const o of options) {
        const t = o.trim();
        if (t) fd.append("option", t);
      }
    } else if (predictionType === "numeric") {
      fd.set("numeric_unit", numericUnit.trim());
      fd.set("numeric_tolerance", String(numericTolerance));
    }

    startTransition(async () => {
      const result = await createPredictionAction(fd);
      if (!result.ok) {
        setError(result.error ?? "save_failed");
        return;
      }
      window.location.href = "/admin/predictions";
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* AI Suggest panel */}
      <section className="glass-card rounded-2xl p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              ✨ Suggest predictions with AI
            </h2>
            <p className="text-xs text-white/55">
              Uses the brand&rsquo;s recent posts + upcoming events to ground
              suggestions. ~3¢ per click.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchSuggestions}
            disabled={suggesting || !brandSlug}
            className="rounded-lg bg-aurora px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {suggesting ? "Thinking…" : `Suggest 5 ${TYPE_LABELS[predictionType]}`}
          </button>
        </div>
        <input
          type="text"
          value={topicSeed}
          onChange={(e) => setTopicSeed(e.target.value)}
          placeholder="Optional topic seed — e.g. 'Friday biscuit specials'"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
        />
        {suggestError && (
          <p className="mt-2 text-xs text-amber-300">{suggestError}</p>
        )}
        {suggestions.length > 0 && (
          <ul className="mt-3 space-y-2">
            {suggestions.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border border-white/10 bg-white/5 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{s.title}</p>
                    {s.body && (
                      <p className="mt-0.5 text-xs text-white/65">{s.body}</p>
                    )}
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-white/40">
                      {s.prediction_type} ·{" "}
                      {s.suggested_close_in_hours ?? 72}h ·{" "}
                      {s.suggested_points ?? 50}pts
                      {s.numeric_unit ? ` · ${s.numeric_unit}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => applySuggestion(s)}
                    className="rounded-md bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/30"
                  >
                    Use this
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Main form */}
      <section className="glass-card space-y-4 rounded-2xl p-5">
        <Field label="Brand">
          <select
            value={brandSlug}
            onChange={(e) => setBrandSlug(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            {brands.map((b) => (
              <option key={b.slug} value={b.slug} className="bg-neutral-900">
                {b.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Type">
          <div className="flex flex-wrap gap-2">
            {(["multi", "numeric", "date"] as PredictionType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPredictionType(t)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  predictionType === t
                    ? "bg-aurora text-white"
                    : "border border-white/15 text-white/70 hover:bg-white/5"
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="How many biscuits will Nellie's sell this Friday?"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
          />
        </Field>

        <Field
          label="Body"
          hint="Optional context — when, why, what's at stake."
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Friday brunch is our biggest biscuit day. Take a guess."
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
          />
        </Field>

        {predictionType === "multi" && (
          <Field label="Options" hint="2–8 options. Members pick one.">
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="rounded-lg border border-white/15 px-3 text-sm text-white/60 hover:bg-white/5"
                      aria-label="Remove option"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {options.length < 8 && (
                <button
                  type="button"
                  onClick={addOption}
                  className="rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-xs text-white/65 hover:bg-white/5"
                >
                  + Add option
                </button>
              )}
            </div>
          </Field>
        )}

        {predictionType === "numeric" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Unit" hint="e.g. biscuits, attendees, dollars">
              <input
                type="text"
                value={numericUnit}
                onChange={(e) => setNumericUnit(e.target.value)}
                placeholder="biscuits"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
              />
            </Field>
            <Field
              label="Exact-match tolerance"
              hint="0 = exact only. Bigger = more lenient."
            >
              <input
                type="number"
                min={0}
                value={numericTolerance}
                onChange={(e) => setNumericTolerance(Number(e.target.value))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Closes at">
            <input
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            />
          </Field>
          <Field
            label="Points for correct"
            hint="Awarded automatically on resolve."
          >
            <input
              type="number"
              min={0}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            />
          </Field>
        </div>

        <Field label="Visibility">
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as PredictionVisibility)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            {(Object.keys(VISIBILITY_LABELS) as PredictionVisibility[]).map((v) => (
              <option key={v} value={v} className="bg-neutral-900">
                {VISIBILITY_LABELS[v]}
              </option>
            ))}
          </select>
        </Field>

        {predictionType !== "multi" && (
          <Field label="Award strategy">
            <select
              value={awardStrategy}
              onChange={(e) => setAwardStrategy(e.target.value as AwardStrategy)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            >
              {(Object.keys(STRATEGY_LABELS) as AwardStrategy[]).map((s) => (
                <option key={s} value={s} className="bg-neutral-900">
                  {STRATEGY_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="flex flex-wrap gap-4">
          <Toggle
            checked={allowVoteChanges}
            onChange={setAllowVoteChanges}
            label="Allow vote changes until close"
          />
          <Toggle
            checked={showLiveTally}
            onChange={setShowLiveTally}
            label="Show live tally to members"
          />
        </div>
      </section>

      {error && (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <a
          href="/admin/predictions"
          className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/75 hover:bg-white/5"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-aurora px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save prediction"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-white/55">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-white/40">{hint}</span>}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border border-white/20 bg-white/10"
      />
      <span className="text-sm text-white/85">{label}</span>
    </label>
  );
}
