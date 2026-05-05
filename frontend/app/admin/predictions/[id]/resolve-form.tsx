"use client";

import { useState, useTransition } from "react";
import { resolvePredictionAction } from "@/app/brands/[slug]/community/predictions-actions";
import type { PollOption, PredictionType } from "@/lib/predictions/types";

interface Props {
  postId: string;
  predictionType: PredictionType;
  options: PollOption[];
  numericUnit: string | null;
}

export function ResolvePredictionForm({
  postId,
  predictionType,
  options,
  numericUnit,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [correctOptionId, setCorrectOptionId] = useState<string>("");
  const [correctNumeric, setCorrectNumeric] = useState<string>("");
  const [correctDate, setCorrectDate] = useState<string>("");
  const [resolutionNote, setResolutionNote] = useState<string>("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (predictionType === "multi" && !correctOptionId) {
      return setError("Pick the correct option.");
    }
    if (predictionType === "numeric" && correctNumeric.trim() === "") {
      return setError("Enter the correct number.");
    }
    if (predictionType === "date" && !correctDate) {
      return setError("Pick the correct date.");
    }

    const fd = new FormData();
    fd.set("postId", postId);
    fd.set("resolution_note", resolutionNote.trim());
    if (predictionType === "multi") fd.set("correct_option_id", correctOptionId);
    if (predictionType === "numeric") fd.set("correct_numeric", correctNumeric);
    if (predictionType === "date") fd.set("correct_date", correctDate);

    if (
      !confirm(
        "Resolve this prediction now? Winners will be awarded points immediately and notified.",
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await resolvePredictionAction(fd);
      if (!result.ok) {
        setError(result.error ?? "save_failed");
        return;
      }
      const { winners, pointsAwarded } = result.data ?? {
        winners: 0,
        pointsAwarded: 0,
      };
      setSuccess(
        `Resolved · ${winners} winner${winners === 1 ? "" : "s"} · ${pointsAwarded} pts awarded`,
      );
      // Reload after 1s so the page shows the resolved state
      setTimeout(() => window.location.reload(), 1200);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {predictionType === "multi" && (
        <fieldset className="space-y-2">
          <legend className="mb-1 block text-xs font-semibold uppercase tracking-wider text-white/55">
            Correct option
          </legend>
          {options.length === 0 && (
            <p className="text-xs text-amber-300">
              No options found for this prediction.
            </p>
          )}
          {options.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              <input
                type="radio"
                name="correct_option_id"
                value={o.id}
                checked={correctOptionId === o.id}
                onChange={() => setCorrectOptionId(o.id)}
                className="h-4 w-4"
              />
              <span className="text-white/90">{o.label}</span>
            </label>
          ))}
        </fieldset>
      )}

      {predictionType === "numeric" && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-white/55">
            Correct number{numericUnit ? ` (${numericUnit})` : ""}
          </span>
          <input
            type="number"
            step="any"
            value={correctNumeric}
            onChange={(e) => setCorrectNumeric(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          />
        </label>
      )}

      {predictionType === "date" && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-white/55">
            Correct date
          </span>
          <input
            type="date"
            value={correctDate}
            onChange={(e) => setCorrectDate(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          />
        </label>
      )}

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-white/55">
          Resolution note (optional)
        </span>
        <textarea
          value={resolutionNote}
          onChange={(e) => setResolutionNote(e.target.value)}
          rows={2}
          placeholder="A short reveal members will see — e.g. 'We sold 412 by 8pm thanks to the brunch rush.'"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
        />
      </label>

      {error && (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {success}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-aurora px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Resolving…" : "Resolve & award points"}
        </button>
      </div>
    </form>
  );
}
