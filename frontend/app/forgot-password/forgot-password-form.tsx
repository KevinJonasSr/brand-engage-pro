"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeRelativePath } from "@/lib/safe-redirect";
import {
  TurnstileWidget,
  isTurnstileRequired,
  prefetchTurnstileScript,
  type TurnstileLoadState,
} from "@/components/turnstile-widget";
import {
  RESET_LINK_COOLDOWN_SECONDS,
  RESET_LINK_SENT_MESSAGE,
  authEmailRedirectTo,
  buildResetPasswordEmailOptions,
  resetLinkButtonLabel,
} from "@/lib/password-reset";
import { scrollToTurnstileChallenge, shouldShowParentChallengeError } from "@/lib/turnstile-ux";

export default function ForgotPasswordForm() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
          <div className="glass-card p-8 text-center text-sm text-iron/70">Loading…</div>
        </main>
      }
    >
      <ForgotPasswordFields />
    </Suspense>
  );
}

function ForgotPasswordFields() {
  const searchParams = useSearchParams();
  const next = safeRelativePath(searchParams.get("next"), "/");
  const callbackError = searchParams.get("error");
  const turnstileRequired = isTurnstileRequired();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    callbackError ? "error" : "idle",
  );
  const [message, setMessage] = useState(callbackError ?? "");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileLoadState, setTurnstileLoadState] = useState<TurnstileLoadState>("loading");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loginHref = next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";

  const resetChallenge = useCallback(() => {
    setTurnstileToken(null);
    setTurnstileLoadState("loading");
    setTurnstileKey((key) => key + 1);
  }, []);

  const handleTurnstileSuccess = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileError(false);
  }, []);
  const handleTurnstileError = useCallback(() => {
    setTurnstileError(true);
    setTurnstileToken(null);
  }, []);
  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken(null);
  }, []);
  const handleTurnstileLoadState = useCallback((state: TurnstileLoadState) => {
    setTurnstileLoadState(state);
    if (state === "error" || state === "loading") setTurnstileToken(null);
    if (state === "loading" || state === "ready") setTurnstileError(false);
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  useEffect(() => {
    if (turnstileRequired) prefetchTurnstileScript();
  }, [turnstileRequired]);

  function startCooldown() {
    setCooldown(RESET_LINK_COOLDOWN_SECONDS);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cooldown > 0 || status === "loading") return;
    if (!email.trim()) {
      setStatus("error");
      setMessage("Enter your email first.");
      return;
    }
    if (
      turnstileRequired &&
      (!turnstileToken || turnstileError || turnstileLoadState !== "ready")
    ) {
      setStatus("error");
      setMessage(
        turnstileLoadState === "loading"
          ? "Security check is still loading. Hang on a moment, then try again."
          : turnstileLoadState === "error"
            ? "Security check didn't load. Tap Retry, then send the link."
            : "Complete the security check, then send the link.",
      );
      requestAnimationFrame(() => scrollToTurnstileChallenge());
      return;
    }

    setStatus("loading");
    setMessage("");
    try {
      const supabase = createClient();
      const options = buildResetPasswordEmailOptions({
        redirectTo: authEmailRedirectTo("/reset-password"),
        turnstileConfigured: turnstileRequired,
        turnstileToken,
      });
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), options);
      if (error) throw error;
      setStatus("sent");
      setMessage(RESET_LINK_SENT_MESSAGE);
      startCooldown();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to send reset link.");
    } finally {
      resetChallenge();
    }
  }

  const buttonLabel = resetLinkButtonLabel({
    cooldown,
    status,
    turnstileConfigured: turnstileRequired,
    loadState: turnstileLoadState,
    hasToken: Boolean(turnstileToken?.trim()),
  });

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="glass-card space-y-6 p-8">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-iron/70">Brand Engage Pro</p>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Reset your password
          </h1>
          <p className="text-sm text-iron/70">
            Enter your email and we&apos;ll send you a link to set a new password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-iron/70">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-iron/10 bg-parchment/40 px-4 py-3 text-sm text-iron placeholder:text-iron/50 focus:border-iron/40 focus:outline-none"
              placeholder="you@email.com"
            />
          </label>

          {turnstileRequired && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-iron/45">Security check</p>
              <TurnstileWidget
                key={turnstileKey}
                onSuccess={handleTurnstileSuccess}
                onError={handleTurnstileError}
                onStall={handleTurnstileError}
                onExpire={handleTurnstileExpire}
                onLoadStateChange={handleTurnstileLoadState}
                theme="dark"
              />
              {shouldShowParentChallengeError({
                loadState: turnstileLoadState,
                challengeFailed: turnstileError,
              }) && (
                <p className="text-xs text-ember">
                  Security check failed. Please retry and try again.
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "loading" || cooldown > 0}
            className="w-full rounded-full bg-ember px-4 py-3 text-sm font-semibold text-linen shadow-glass disabled:opacity-60"
          >
            {buttonLabel}
          </button>
        </form>

        {message && (
          <p
            role={status === "error" ? "alert" : "status"}
            className={`text-sm ${status === "error" ? "text-ember" : "text-sage-ink"}`}
          >
            {message}
          </p>
        )}

        <p className="text-center text-sm text-iron/70">
          Remembered your password?{" "}
          <Link href={loginHref} className="text-iron underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
