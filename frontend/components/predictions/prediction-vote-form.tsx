"use client";

import { useState, useTransition } from "react";
import { votePredictionAction } from "@/app/brands/[slug]/community/predictions-actions";
import type { PollOption, PollVote, PredictionType } from "@/lib/predictions/types";

interface Props {
  postId: string;
  predictionType: PredictionType;
  options: PollOption[];
  numericUnit: string | null;
  currentVote: PollVote | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  signed_out: "You need to be signed in to vote.",
  missing_post: "Couldn't find this prediction.",
  post_not_found: "Couldn't find this prediction.",
  already_resolved: "This prediction has already been resolved.",
  voting_closed: "Voting has closed.",
  already_voted: "You already voted, and the host doesn't allow changes.",
  missing_option: "Pick an option.",
  bad_number: "Enter a number.",
  bad_date: "Pick a date.",
};

export function PredictionVoteForm({
  postId,
  predictionType,
  options,
  numericUnit,
  currentVote,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [optionId, setOptionId] = useState<string>(currentVote?.option_id ?? "");
  const [numericValue, setNumericValue] = useState<string>(
    currentVote?.numeric_value != null ? String(currentVote.numeric_value) : "",
  );
  const [dateValue, setDateValue] = useState<string>(currentVote?.date_value ?? "");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (predictionType === "multi" && !optionId) {
      return setError(ERROR_MESSAGES.missing_option);
    }
    if (
      predictionType === "numeric" &&
      (numericValue.trim() === "" || Number.isNaN(Number(numericValue)))
    ) {
      return setError(ERROR_MESSAGES.bad_number);
    }
    if (predictionType === "date" && !dateValue) {
      return setError(ERROR_MESSAGES.bad_date);
    }

    const fd = new FormData();
    fd.set("postId", postId);
    if (predictionType === "multi") fd.set("option_id", optionId);
    if (predictionType === "numeric") fd.set("numeric_value", numericValue);
    if (predictionType === "date") fd.set("date_value", dateValue);

    startTransition(async () => {
      const result = await votePredictionAction(fd);
      if (!result.ok) {
        setError(ERROR_MESSAGES[result.error ?? ""] ?? result.error ?? "Couldn't save vote.");
        return;
      }
      setSubmitted(true);
      // Reload after 800ms so the parent server component re-fetches with the
      // new vote state (showing the locked tally view if appropriate).
      setTimeout(() => window.location.reload(), 800);
    });
  }

  if (submitted) {
    return (
      <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
        ✓ Vote saved.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {predictionType === "multi" && (
        <div className="space-y-2">
          {options.length === 0 && (
            <p className="text-xs text-amber-300">
              No options on this prediction.
            </p>
          )}
          {options.map((o) => {
            const selected = optionId === o.id;
            return (
              <label
                key={o.id}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                  selected
                    ? "border-aurora bg-white/10 text-white"
                    : "border-white/10 bg-white/5 text-white/85 hover:bg-white/10"
                }`}
              >
                <input
                  type="radio"
                  name="option_id"
                  value={o.id}
                  checked={selected}
                  onChange={() => setOptionId(o.id)}
                  className="h-4 w-4"
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {predictionType === "numeric" && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-white/55">
            Your guess{numericUnit ? ` (${numericUnit})` : ""}
          </span>
          <input
            type="number"
            step="any"
            value={numericValue}
            onChange={(e) => setNumericValue(e.target.value)}
            placeholder="Enter a number"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40"
          />
        </label>
      )}

      {predictionType === "date" && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-white/55">
            Your guess
          </span>
          <input
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          />
        </label>
      )}

      {error && (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-aurora px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : currentVote ? "Update vote" : "Submit vote"}
        </button>
      </div>
    </form>
  );
}
