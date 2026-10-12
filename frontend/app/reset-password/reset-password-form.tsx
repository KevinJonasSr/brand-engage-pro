"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PasswordInput } from "@/components/password-input";
import { createClient } from "@/lib/supabase/client";
import {
  clearBrowserSignedOut,
  hasBrowserSignedOutMarker,
  stampBrowserSignedOut,
} from "@/lib/auth-cookies";
import { isAuthEmailOtpType } from "@/lib/password-reset";
import { parseRecoveryHash } from "@/lib/recovery-hash";

export default function ResetPasswordForm({
  forgotPasswordEnabled,
}: {
  forgotPasswordEnabled: boolean;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
          <div className="glass-card p-8 text-center text-sm text-iron/70">Loading…</div>
        </main>
      }
    >
      <ResetPasswordFields forgotPasswordEnabled={forgotPasswordEnabled} />
    </Suspense>
  );
}

function ResetPasswordFields({
  forgotPasswordEnabled,
}: {
  forgotPasswordEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phase, setPhase] = useState<"checking" | "ready" | "missing">("checking");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    const hash = parseRecoveryHash(window.location.hash);
    const hasProof = Boolean(
      code || (tokenHash && isAuthEmailOtpType(type)) || hash?.kind === "tokens",
    );
    const wasSignedOut = hasBrowserSignedOutMarker();
    // A sticky Sign out must not let a leftover session become "set a new
    // password" unless this navigation actually carries a recovery proof.
    if (!hasProof && wasSignedOut) {
      setPhase("missing");
      return;
    }
    if (wasSignedOut) clearBrowserSignedOut();
    const supabase = createClient();

    async function establish() {
      try {
        if (hash?.kind === "error") throw new Error(hash.message);
        if (tokenHash && isAuthEmailOtpType(type)) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (hash?.kind === "tokens") {
          const { error } = await supabase.auth.setSession({
            access_token: hash.accessToken,
            refresh_token: hash.refreshToken,
          });
          if (error) throw error;
        }
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session && hasProof) {
          window.history.replaceState(null, "", "/reset-password");
        }
        if (!session) {
          if (wasSignedOut) stampBrowserSignedOut();
          setPhase("missing");
          return;
        }
        setPhase("ready");
      } catch {
        if (cancelled) return;
        if (wasSignedOut) stampBrowserSignedOut();
        setPhase("missing");
      }
    }

    void establish();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setStatus("error");
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setStatus("error");
      setMessage("Passwords do not match.");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStatus("done");
      setMessage("Your password has been updated. Redirecting to sign in…");
      window.setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to update password.");
    }
  }

  if (phase === "checking") {
    return (
      <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
        <div className="glass-card p-8 text-center text-sm text-iron/70">Loading…</div>
      </main>
    );
  }

  if (phase === "missing") {
    return (
      <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
        <div className="glass-card space-y-6 p-8">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-wide text-iron/70">Brand Engage Pro</p>
            <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              Reset link expired
            </h1>
            <p className="text-sm text-iron/70">
              This password reset link is invalid or has already been used. Request a new one
              and open it in the same browser.
            </p>
          </div>
          <Link
            href={forgotPasswordEnabled ? "/forgot-password" : "/login"}
            className="inline-flex w-full items-center justify-center rounded-full bg-ember px-4 py-3 text-sm font-semibold text-linen shadow-glass"
          >
            {forgotPasswordEnabled ? "Request a new reset link" : "Back to sign in"}
          </Link>
          <p className="text-center text-sm text-iron/70">
            Remember your password?{" "}
            <Link href="/login" className="text-iron underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="glass-card space-y-6 p-8">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-iron/70">Brand Engage Pro</p>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Set a new password
          </h1>
          <p className="text-sm text-iron/70">Choose a new password for your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="new-password" className="block text-xs uppercase tracking-wide text-iron/70">
              New password
            </label>
            <PasswordInput
              id="new-password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-iron/10 bg-parchment/40 px-4 py-3 text-sm text-iron placeholder:text-iron/40 focus:border-iron/40 focus:outline-none"
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="confirm-password" className="block text-xs uppercase tracking-wide text-iron/70">
              Confirm password
            </label>
            <PasswordInput
              id="confirm-password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-iron/10 bg-parchment/40 px-4 py-3 text-sm text-iron placeholder:text-iron/40 focus:border-iron/40 focus:outline-none"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={status === "loading" || status === "done"}
            className="w-full rounded-full bg-ember px-4 py-3 text-sm font-semibold text-linen shadow-glass disabled:opacity-60"
          >
            {status === "loading" ? "Updating…" : "Update password"}
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
      </div>
    </main>
  );
}
