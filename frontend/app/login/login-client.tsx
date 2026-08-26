"use client";

import { Suspense, useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  TurnstileWidget,
  isTurnstileRequired,
  prefetchTurnstileScript,
  turnstileFailureMessage,
  verifyTurnstileToken,
  type TurnstileLoadState,
} from "@/components/turnstile-widget";
import {
  emailReadyForMagicLink,
  magicLinkButtonLabel,
  magicLinkClickAction,
  magicLinkPersistentHelper,
  nextMagicLinkGate,
  scrollToTurnstileChallenge,
  shouldShowParentChallengeError,
} from "@/lib/turnstile-ux";
import { safeRelativePath } from "@/lib/safe-redirect";

export default function LoginClient({
  magicLinkEnabled,
  forgotPasswordEnabled,
  appOrigin,
}: {
  magicLinkEnabled: boolean;
  forgotPasswordEnabled: boolean;
  appOrigin: string;
}) {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm
        magicLinkEnabled={magicLinkEnabled}
        forgotPasswordEnabled={forgotPasswordEnabled}
        appOrigin={appOrigin}
      />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
      <div className="glass-card p-8 text-center text-sm text-white/60">Loading…</div>
    </main>
  );
}

function LoginForm({
  magicLinkEnabled,
  forgotPasswordEnabled,
  appOrigin,
}: {
  magicLinkEnabled: boolean;
  forgotPasswordEnabled: boolean;
  appOrigin: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRelativePath(searchParams.get("next"), "/");
  const ref = searchParams.get("ref");
  const signupParams = new URLSearchParams();
  if (next !== "/") signupParams.set("next", next);
  if (ref) signupParams.set("ref", ref);
  const signupHref = `/signup${signupParams.size ? `?${signupParams.toString()}` : ""}`;
  const forgotHref = `/forgot-password${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;

  const turnstileRequired = isTurnstileRequired();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "magic-sent">("idle");
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileLoadState, setTurnstileLoadState] =
    useState<TurnstileLoadState>("loading");
  const [turnstileKey, setTurnstileKey] = useState(0);
  // Don't mount Turnstile until the guest chooses magic-link — keeps the
  // password door above the fold and avoids a blank check on first paint.
  const [magicLinkOpen, setMagicLinkOpen] = useState(false);
  const pendingMagicSend = useRef(false);

  const handleTurnstileSuccess = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileError(false);
  }, []);
  const handleTurnstileError = useCallback(() => setTurnstileError(true), []);
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(null), []);
  const handleTurnstileLoadState = useCallback((state: TurnstileLoadState) => {
    setTurnstileLoadState(state);
    // Retry remounts into loading while challengeFailed was still true —
    // clear it so "Security check failed…" cannot flash under the skeleton.
    if (state === "loading" || state === "ready") {
      setTurnstileError(false);
    }
  }, []);
  // Tokens are single-use: once verified (pass or fail) the widget must be
  // remounted to issue a fresh one, or every retry fails with a stale token.
  const resetChallenge = useCallback(() => {
    setTurnstileToken(null);
    setTurnstileLoadState("loading");
    setTurnstileKey((k) => k + 1);
  }, []);

  // Resending signInWithOtp overwrites the previous verifier cookie, silently
  // invalidating an already-sent link. Lock the button for 60s after a send.
  const MAGIC_COOLDOWN_SECONDS = 60;
  const [magicCooldown, setMagicCooldown] = useState(0);
  const cooldownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (cooldownInterval.current) clearInterval(cooldownInterval.current);
    };
  }, []);

  useEffect(() => {
    if (turnstileRequired && magicLinkEnabled) prefetchTurnstileScript();
  }, [turnstileRequired, magicLinkEnabled]);

  useEffect(() => {
    if (!magicLinkEnabled || !magicLinkOpen) return;
    const id = window.requestAnimationFrame(() => scrollToTurnstileChallenge());
    return () => window.cancelAnimationFrame(id);
  }, [magicLinkEnabled, magicLinkOpen]);

  function startMagicCooldown() {
    setMagicCooldown(MAGIC_COOLDOWN_SECONDS);
    if (cooldownInterval.current) clearInterval(cooldownInterval.current);
    cooldownInterval.current = setInterval(() => {
      setMagicCooldown((s) => {
        if (s <= 1) {
          if (cooldownInterval.current) clearInterval(cooldownInterval.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  // Password sign-in intentionally skips Turnstile (Fan Engage parity /
  // least-confused guest path). Magic-link below still verifies captcha.
  // Do not reintroduce password Turnstile without an explicit product decision —
  // open PR #6 conflicts by requiring it on password login.
  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    pendingMagicSend.current = false;
    if (!email.trim()) {
      setStatus("error");
      setMessage("Enter an email first.");
      return;
    }
    if (!password) {
      setStatus("error");
      setMessage(
        magicLinkEnabled
          ? "Enter your password, or use a magic link below."
          : "Enter your password.",
      );
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push(next);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to sign in.");
    }
  }

  const magicGate = nextMagicLinkGate({
    configured: turnstileRequired,
    revealed: magicLinkOpen && emailReadyForMagicLink(email),
    token: turnstileToken,
    loadState: turnstileLoadState,
  });
  const persistentHelper = magicLinkPersistentHelper({
    gate: magicGate,
    loadState: turnstileLoadState,
    challengeFailed: turnstileError,
  });
  const showParentChallengeError = shouldShowParentChallengeError({
    loadState: turnstileLoadState,
    challengeFailed: turnstileError,
  });

  async function sendMagicLink(token: string | null) {
    setStatus("loading");
    setMessage("");

    const captcha = await verifyTurnstileToken(token);
    resetChallenge();
    if (!captcha.success) {
      pendingMagicSend.current = false;
      setStatus("error");
      setMessage(turnstileFailureMessage(captcha.error));
      requestAnimationFrame(() => scrollToTurnstileChallenge());
      return;
    }
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // Never $VERCEL_URL / vercel.app / apex — www only.
          emailRedirectTo: `${appOrigin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      pendingMagicSend.current = false;
      setStatus("magic-sent");
      setMessage(
        "Magic link sent. Check your email — use the newest link; requesting another one invalidates the previous one.",
      );
      startMagicCooldown();
    } catch (err) {
      pendingMagicSend.current = false;
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to send magic link.");
    }
  }

  // Secondary door: magic link. Turnstile only on this path.
  async function handleMagicLink() {
    if (!magicLinkEnabled) return;
    if (magicCooldown > 0 || status === "loading") return;
    const action = magicLinkClickAction({
      email,
      configured: turnstileRequired,
      revealed: magicLinkOpen,
      token: turnstileToken,
      loadState: turnstileLoadState,
    });
    if (action === "need-email") {
      setStatus("error");
      setMessage("Enter an email first.");
      return;
    }

    if (action === "reveal") {
      pendingMagicSend.current = true;
      setMagicLinkOpen(true);
      setStatus("idle");
      setMessage("");
      return;
    }

    if (action !== "send") {
      pendingMagicSend.current = true;
      // Widget / helper / button label already explain wait, retry, and
      // complete-check — don't stack a second error line on the page.
      requestAnimationFrame(() => scrollToTurnstileChallenge());
      return;
    }

    pendingMagicSend.current = false;
    await sendMagicLink(turnstileToken);
  }

  // Completing the check after the first tap should send without a second click.
  useEffect(() => {
    if (!magicLinkEnabled) return;
    if (!pendingMagicSend.current || !turnstileToken || magicCooldown > 0) return;
    if (status === "loading") return;
    pendingMagicSend.current = false;
    void sendMagicLink(turnstileToken);
    // sendMagicLink is recreated each render; token is the trigger we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnstileToken, magicLinkEnabled]);

  const magicLinkDisabled = status === "loading" || magicCooldown > 0;

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="glass-card space-y-6 p-8">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-white/60">Brand Engage Pro</p>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Welcome back
          </h1>
          <p className="text-sm text-white/70">Sign in to access your rewards and perks.</p>
        </div>

        {/* Shared email — outside the password form so magic-link never hits
            browser constraint validation on an empty password field. */}
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-white/60">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
            placeholder="you@email.com"
          />
        </label>

        {/* Password path only — HTML required applies solely to this submit.
            Magic-link lives outside this <form> so empty password never blocks OTP. */}
        <form onSubmit={handlePassword} className="space-y-4">
          <label className="block space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-wide text-white/60">Password</span>
              {forgotPasswordEnabled && (
                <Link
                  href={forgotHref}
                  className="text-xs text-white/60 underline-offset-2 hover:text-white hover:underline"
                >
                  Forgot password?
                </Link>
              )}
            </div>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass disabled:opacity-60"
          >
            {status === "loading" ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {magicLinkEnabled && (
          <>
            <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-white/50">
              <div className="h-px flex-1 bg-white/10" />
              or
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Magic-link path — deliberately outside the password <form>.
                type=button so it never triggers password constraint validation. */}
            <div className="space-y-3">
              <p className="text-xs text-white/45">
                Prefer a passwordless email link? We&apos;ll send it to the{" "}
                <span className="text-white/70">email above</span>
                {magicLinkOpen && turnstileLoadState !== "error" && !turnstileError
                  ? ". Complete the security check, then send."
                  : "."}{" "}
                Password can stay blank. Use the newest link — each request invalidates
                the previous one.
              </p>

              {turnstileRequired && magicLinkOpen && emailReadyForMagicLink(email) && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-white/45">Security check</p>
                  <TurnstileWidget
                    key={turnstileKey}
                    onSuccess={handleTurnstileSuccess}
                    onError={handleTurnstileError}
                    onExpire={handleTurnstileExpire}
                    onLoadStateChange={handleTurnstileLoadState}
                    theme="dark"
                  />
                  {showParentChallengeError && (
                    <p className="text-xs text-rose-300">
                      Security check failed. Retry above, or sign in with your password.
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  void handleMagicLink();
                }}
                disabled={magicLinkDisabled}
                className="w-full rounded-full border border-white/20 px-4 py-3 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-60"
              >
                {magicLinkButtonLabel({
                  cooldown: magicCooldown,
                  status,
                  gate: magicGate,
                })}
              </button>
            </div>
          </>
        )}

        {magicLinkEnabled && persistentHelper && status !== "error" && status !== "magic-sent" && (
          <p className="text-sm text-emerald-300">{persistentHelper}</p>
        )}
        {message && (
          <p
            className={`text-sm ${
              status === "error" ? "text-red-300" : "text-emerald-300"
            }`}
          >
            {message}
          </p>
        )}

        <p className="text-center text-sm text-white/60">
          New member?{" "}
          <Link href={signupHref} className="text-white underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
