"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { CheckCircle2, Circle, X } from "lucide-react";
import {
  FIRST_SESSION_BLURB,
  FIRST_SESSION_DISMISS_KEY,
  FIRST_SESSION_EYEBROW,
  FIRST_SESSION_TITLE,
  firstSessionDoneCount,
  firstSessionSteps,
  shouldShowFirstSessionChecklist,
  type FirstSessionFacts,
} from "@/lib/first-session";

function subscribeDismiss() {
  return () => {};
}
function getDismissSnapshot(): string | null {
  try {
    return window.localStorage.getItem(FIRST_SESSION_DISMISS_KEY);
  } catch {
    return null;
  }
}
function getServerDismissSnapshot(): string | null {
  return null;
}

export default function FirstSessionChecklist({
  facts,
  dismissible = true,
}: {
  facts: FirstSessionFacts;
  dismissible?: boolean;
}) {
  const storedDismissal = useSyncExternalStore(
    subscribeDismiss,
    getDismissSnapshot,
    getServerDismissSnapshot,
  );
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const dismissed = dismissible && (storedDismissal !== null || sessionDismissed);

  if (!shouldShowFirstSessionChecklist(facts, dismissed)) return null;

  const steps = firstSessionSteps(facts);
  const done = firstSessionDoneCount(facts);

  function dismiss() {
    try {
      window.localStorage.setItem(FIRST_SESSION_DISMISS_KEY, String(Date.now()));
    } catch {
      // private mode — session hide still works
    }
    setSessionDismissed(true);
  }

  return (
    <section
      className="glass-card p-5"
      aria-labelledby="first-session-title"
      data-first-session-checklist
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">
            {FIRST_SESSION_EYEBROW}
          </p>
          <h2
            id="first-session-title"
            className="mt-1 text-lg font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {FIRST_SESSION_TITLE}
          </h2>
          <p className="mt-1 text-xs text-white/70">{FIRST_SESSION_BLURB}</p>
        </div>
        {dismissible && (
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
            aria-label="Dismiss first-session checklist"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-white/50">
        {done} of {steps.length} done
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-aurora to-ember"
          style={{ width: `${(done / steps.length) * 100}%` }}
        />
      </div>

      <ul className="mt-4 space-y-2">
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              href={step.href}
              className={`flex items-start gap-3 rounded-2xl px-3 py-2.5 transition ${
                step.done
                  ? "bg-emerald-500/10 text-white/70"
                  : "bg-black/30 hover:bg-white/10"
              }`}
            >
              {step.done ? (
                <CheckCircle2
                  size={18}
                  className="mt-0.5 shrink-0 text-emerald-300"
                  aria-hidden
                />
              ) : (
                <Circle
                  size={18}
                  className="mt-0.5 shrink-0 text-white/40"
                  aria-hidden
                />
              )}
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">
                  {step.label}
                </span>
                <span className="mt-0.5 block text-xs text-white/60">
                  {step.detail}
                </span>
              </span>
              {!step.done && (
                <span className="ml-auto shrink-0 self-center text-xs text-white/50">
                  Go →
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
