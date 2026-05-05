"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");
  // Where to send the user after a successful signup. Preserve any
  // ?ref=<brand-slug> attribution from the brand-page Join CTA.
  const onboardingHref = ref ? `/onboarding?ref=${encodeURIComponent(ref)}` : "/onboarding";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "confirm">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(onboardingHref)}`,
        },
      });
      if (error) throw error;

      // If email confirmation is OFF in Supabase, Supabase returns a session here
      // and we can push straight into onboarding.
      if (data.session) {
        router.push(onboardingHref);
        router.refresh();
        return;
      }

      // Otherwise Supabase emailed a confirmation link — prompt them to check it.
      setStatus("confirm");
      setMessage("Check your email to confirm and finish signing up.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to create account.");
    }
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="glass-card space-y-6 p-8">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-white/60">Brand Engage Pro</p>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Join the inner circle
          </h1>
          <p className="text-sm text-white/70">
            Create an account to earn points, unlock rewards, and get backstage access.
          </p>
          {referrerName && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
              <span aria-hidden>👋</span>
              <span>Invited by {referrerName}</span>
            </div>
          )}
          {community && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-aurora/40 bg-aurora/10 px-3 py-1 text-xs text-aurora">
              <span aria-hidden>·</span>
              <span>Joining via @{community}</span>
            </div>
          )}
        </div>


        <div className="space-y-2">
          <button
            type="button"
            disabled={status === "loading"}
            onClick={async () => {
              setMessage("");
              const supabase = createClient();
              const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                  redirectTo: `${window.location.origin}/auth/callback?next=/`,
                },
              });
              if (error) {
                setStatus("error");
                setMessage(error.message);
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path fill="currentColor" d="M21.35 11.1H12v3.4h5.36c-.46 2.42-2.5 4.18-5.36 4.18a5.68 5.68 0 1 1 0-11.36c1.46 0 2.79.5 3.84 1.34l2.55-2.55A9.13 9.13 0 0 0 12 3a9 9 0 1 0 0 18c5.21 0 8.65-3.66 8.65-8.81 0-.59-.06-1.16-.16-1.66l-.14-.43z" />
            </svg>
            Continue with Google
          </button>
          <button
            type="button"
            disabled={status === "loading"}
            onClick={async () => {
              setMessage("");
              const supabase = createClient();
              const { error } = await supabase.auth.signInWithOAuth({
                provider: "apple",
                options: {
                  redirectTo: `${window.location.origin}/auth/callback?next=/`,
                },
              });
              if (error) {
                setStatus("error");
                setMessage(error.message);
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path fill="currentColor" d="M16.5 12.5c0-2.6 2.1-3.8 2.2-3.9-1.2-1.7-3-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.4 1-4.3 2.6-1.8 3.2-.5 7.9 1.3 10.4.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.9-.9 3.5-.9 1.6 0 2.2.9 3.6.8 1.5 0 2.4-1.3 3.3-2.5 1-1.5 1.5-2.9 1.5-3-.1 0-2.9-1.1-2.9-4.1zm-2.6-7.6c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.5-.7.8-1.3 2-1.1 3.2 1.2.1 2.4-.6 3-1.4z" />
            </svg>
            Continue with Apple
          </button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-midnight px-2 text-[10px] uppercase tracking-widest text-white/40">
              Or sign up with email
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-white/60">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
              placeholder="you@email.com"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-white/60">Password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
              placeholder="at least 8 characters"
            />
            {password && (() => {
              let score = 0;
              if (password.length >= 8) score += 1;
              if (password.length >= 12) score += 1;
              if (/[A-Z]/.test(password)) score += 1;
              if (/\d/.test(password)) score += 1;
              if (/[^A-Za-z0-9]/.test(password)) score += 1;
              const tiers = [
                { label: "Weak", color: "bg-rose-500", w: "20%" },
                { label: "Weak", color: "bg-rose-500", w: "20%" },
                { label: "Fair", color: "bg-amber-400", w: "45%" },
                { label: "Good", color: "bg-emerald-400", w: "70%" },
                { label: "Strong", color: "bg-emerald-500", w: "95%" },
                { label: "Strong", color: "bg-emerald-500", w: "100%" },
              ];
              const t = tiers[score];
              return (
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-1 flex-1 overflow-hidden rounded bg-white/10">
                    <span className={"block h-1 " + t.color} style={{ width: t.w }} />
                  </span>
                  <span className="text-[11px] text-white/50">{t.label}</span>
                </div>
              );
            })()}
          </label>

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass disabled:opacity-60"
          >
            {status === "loading" ? "Creating account…" : "Create account"}
          </button>
        </form>

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
          Already have an account?{" "}
          <Link href="/login" className="text-white underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
