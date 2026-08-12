"use client";

import { Suspense, useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TurnstileWidget, verifyTurnstileToken } from "@/components/turnstile-widget";
import { safeRelativePath } from "@/lib/safe-redirect";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRelativePath(searchParams.get("next"), "/");
  const ref = searchParams.get("ref");
  const signupParams = new URLSearchParams();
  if (next !== "/") signupParams.set("next", next);
  if (ref) signupParams.set("ref", ref);
  const signupHref = `/signup${signupParams.size ? `?${signupParams.toString()}` : ""}`;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "magic-sent">("idle");
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const handleTurnstileSuccess = useCallback((token: string) => setTurnstileToken(token), []);
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(null), []);

  // Resending signInWithOtp overwrites the previous verifier cookie, silently
  // invalidating an already-sent link. Lock the button for 60s after a send.
  const MAGIC_COOLDOWN_SECONDS = 60;
  const [magicCooldown, setMagicCooldown] = useState(0);
  const cooldownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { return () => { if (cooldownInterval.current) clearInterval(cooldownInterval.current); }; }, []);

  function startMagicCooldown() {
    setMagicCooldown(MAGIC_COOLDOWN_SECONDS);
    if (cooldownInterval.current) clearInterval(cooldownInterval.current);
    cooldownInterval.current = setInterval(() => {
      setMagicCooldown((s) => {
        if (s <= 1) { if (cooldownInterval.current) clearInterval(cooldownInterval.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    const captchaOk = await verifyTurnstileToken(turnstileToken);
    if (!captchaOk) {
      setStatus("error");
      setMessage("Please complete the security check before continuing.");
      return;
    }

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

  async function handleMagicLink() {
    if (!email) {
      setStatus("error");
      setMessage("Enter an email first.");
      return;
    }
    setStatus("loading");
    setMessage("");

    const captchaOk = await verifyTurnstileToken(turnstileToken);
    if (!captchaOk) {
      setStatus("error");
      setMessage("Please complete the security check before continuing.");
      return;
    }
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      setStatus("magic-sent");
      setMessage("Magic link sent. Check your email.");
      startMagicCooldown();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to send magic link.");
    }
  }

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

        <form onSubmit={handlePassword} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-white/60">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
              placeholder="you@email.com"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-white/60">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
              placeholder="••••••••"
            />
          </label>

          <TurnstileWidget
            onSuccess={handleTurnstileSuccess}
            onExpire={handleTurnstileExpire}
          />

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass disabled:opacity-60"
          >
            {status === "loading" ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-white/50">
          <div className="h-px flex-1 bg-white/10" />
          or
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <button
          type="button"
          onClick={handleMagicLink}
          disabled={status === "loading" || magicCooldown > 0}
          className="w-full rounded-full border border-white/20 px-4 py-3 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-60"
        >
          {magicCooldown > 0 ? `Resend in ${magicCooldown}s` : "Send me a magic link"}
        </button>

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
