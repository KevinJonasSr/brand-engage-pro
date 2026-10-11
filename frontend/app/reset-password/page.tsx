"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeRelativePath } from "@/lib/safe-redirect";
import { parseRecoveryHash, type RecoveryHash } from "@/lib/recovery-hash";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-6 py-12">
          <div className="glass-card p-8 text-center text-sm text-iron/70">Loading…</div>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRelativePath(searchParams.get("next"), "/");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const recovery = useRef<RecoveryHash | null>(null);

  // Read the recovery link's tokens once, then clear them from the address bar.
  useEffect(() => {
    const parsed = parseRecoveryHash(window.location.hash);
    if (!parsed) return;
    recovery.current = parsed;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (parsed.kind === "error") {
      setStatus("error");
      setMessage(`${parsed.message}. Ask for a new reset link and open it right away.`);
    }
  }, []);

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
      const link = recovery.current;
      if (link?.kind === "tokens") {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: link.accessToken,
          refresh_token: link.refreshToken,
        });
        if (sessionError) throw sessionError;
        recovery.current = null;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.push(next);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error
          ? err.message
          : "Unable to update password. Open the reset link from your email again.",
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="glass-card space-y-6 p-8">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-iron/70">Brand Engage Pro</p>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Choose a new password
          </h1>
          <p className="text-sm text-iron/70">
            Enter a new password for your member account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-iron/70">New password</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-iron/10 bg-parchment/40 px-4 py-3 text-sm text-iron placeholder:text-iron/40 focus:border-iron/40 focus:outline-none"
              placeholder="••••••••"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-iron/70">Confirm password</span>
            <input
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-iron/10 bg-parchment/40 px-4 py-3 text-sm text-iron placeholder:text-iron/40 focus:border-iron/40 focus:outline-none"
              placeholder="••••••••"
            />
          </label>
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-full bg-ember px-4 py-3 text-sm font-semibold text-linen shadow-glass disabled:opacity-60"
          >
            {status === "loading" ? "Saving…" : "Update password"}
          </button>
          {status === "error" && message && (
            <p className="text-sm text-ember">{message}</p>
          )}
          <p className="text-center text-sm text-iron/70">
            <Link href="/login" className="text-iron underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
