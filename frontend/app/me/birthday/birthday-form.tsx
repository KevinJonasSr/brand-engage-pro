"use client";

import { useState, useTransition } from "react";
import { BIRTHDAY_MONTHS, birthdayMonthLabel } from "@/lib/birthday-month";
import { saveBirthdayMonthAction } from "./actions";

export default function BirthdayForm({
  initialMonth,
}: {
  initialMonth: number | null;
}) {
  const [savedMonth, setSavedMonth] = useState<number | null>(initialMonth);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const savedLabel = birthdayMonthLabel(savedMonth);
  if (savedLabel) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="font-medium">Birthday month: {savedLabel}</div>
        <p className="mt-1 text-sm text-white/60">
          Your birthday entrée at Nellie&apos;s (up to $30) opens in {savedLabel}.
          Need to change it? Contact us and we&apos;ll fix it.
        </p>
      </div>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("birthday_month", choice);
    startTransition(async () => {
      const result = await saveBirthdayMonthAction(fd);
      if (result.ok) {
        setSavedMonth(result.month);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4"
    >
      <label className="block">
        <span className="font-medium">Birthday month</span>
        <select
          name="birthday_month"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          disabled={pending}
          className="mt-2 block w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white"
        >
          <option value="">Choose a month</option>
          {BIRTHDAY_MONTHS.map((name, i) => (
            <option key={name} value={String(i + 1)}>
              {name}
            </option>
          ))}
        </select>
        <span className="mt-2 block text-sm text-white/60">
          Needed for the birthday entrée (up to $30) during your birthday month.
          You can set it once.
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !choice}
        className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
