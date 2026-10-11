"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeRelativePath } from "@/lib/safe-redirect";
import { resolveAppUrl } from "@/lib/site-url";

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

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const supabase = createClient();
      const redirectTo = `${resolveAppUrl()}/auth/callback?next=${encodeURIComponent("/reset-password")}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setStatus("sent");
      setMessage("Check your email for a reset link. It may take a minute to arrive.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to send reset email.");
    }
  }

  const loginHref =
    next !== "/"
      ? `/login?next=${encodeURIComponent(next)}`
      : "/login";

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="glass-card space-y-6 p-8">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-iron/70">Brand Engage Pro</p>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Forgot password
          </h1>
          <p className="text-sm text-iron/70">
            Enter your email and we&apos;ll send a link to choose a new password.
          </p>
        </div>

        {status === "sent" ? (
          <div className="space-y-4">
            <p className="text-sm text-sage-ink">{message}</p>
            <Link
              href={loginHref}
              className="inline-block text-sm text-iron underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
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
            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full rounded-full bg-ember px-4 py-3 text-sm font-semibold text-linen shadow-glass disabled:opacity-60"
            >
              {status === "loading" ? "Sending…" : "Send reset link"}
            </button>
            {status === "error" && message && (
              <p className="text-sm text-ember">{message}</p>
            )}
            <p className="text-center text-sm text-iron/70">
              Remembered it?{" "}
              <Link href={loginHref} className="text-iron underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
