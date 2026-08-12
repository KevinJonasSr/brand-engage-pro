"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TurnstileWidget, verifyTurnstileToken } from "@/components/turnstile-widget";

export type ReferrerBrand = {
  slug: string;
  name: string;
  tagline: string | null;
  accentFrom: string;
  accentTo: string;
};

export default function SignupPage({
  referrerName,
  referrerBrand,
}: {
  referrerName?: string | null;
  referrerBrand?: ReferrerBrand | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const community = searchParams.get("community");
  const ref = searchParams.get("ref");
  const rawNext = searchParams.get("next");
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
    ? rawNext
    : null;
  // Where to send the user after a successful signup. Preserve any
  // ?ref=<brand-slug> attribution from the brand-page Join CTA.
  const onboardingHref = ref ? `/onboarding?ref=${encodeURIComponent(ref)}` : "/onboarding";
  const postSignupHref = next ?? onboardingHref;
  const loginParams = new URLSearchParams();
  if (next) loginParams.set("next", next);
  if (ref) loginParams.set("ref", ref);
  const loginHref = `/login${loginParams.size ? `?${loginParams.toString()}` : ""}`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "confirm">("idle");
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const handleTurnstileSuccess = useCallback((token: string) => setTurnstileToken(token), []);
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(null), []);

  // Resubmitting signUp() for the same address silently regenerates the
  // confirmation token, invalidating whatever link is already in the inbox.
  const CONFIRM_COOLDOWN_SECONDS = 45;
  const [confirmCooldown, setConfirmCooldown] = useState(0);
  const cooldownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { return () => { if (cooldownInterval.current) clearInterval(cooldownInterval.current); }; }, []);

  function startConfirmCooldown() {
    setConfirmCooldown(CONFIRM_COOLDOWN_SECONDS);
    if (cooldownInterval.current) clearInterval(cooldownInterval.current);
    cooldownInterval.current = setInterval(() => {
      setConfirmCooldown((s) => {
        if (s <= 1) { if (cooldownInterval.current) clearInterval(cooldownInterval.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  // Email regex — pragmatic, not RFC-perfect. Catches the common typos
  // (missing @, missing TLD, trailing space) without rejecting odd-but-
  // valid addresses.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateEmail(value: string): string | null {
    if (!value.trim()) return "Email is required.";
    if (!EMAIL_RE.test(value.trim())) return "Enter a valid email address.";
    return null;
  }

  function validatePassword(value: string): string | null {
    if (!value) return "Password is required.";
    if (value.length < 8) return "Password must be at least 8 characters.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Inline validation BEFORE we hit Supabase. Surface field-specific
    // errors so a 6-char password isn't silently rejected as a generic
    // "Unable to create account."
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) {
      setStatus("error");
      setMessage("");
      return;
    }

    const captchaOk = await verifyTurnstileToken(turnstileToken);
    if (!captchaOk) {
      setStatus("error");
      setMessage("Please complete the security check before continuing.");
      return;
    }

    setStatus("loading");
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
          emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(postSignupHref)}`,
        },
      });
      if (error) throw error;

      // If email confirmation is OFF in Supabase, Supabase returns a session here
      // and we can push straight into onboarding.
      if (data.session) {
        router.push(postSignupHref);
        router.refresh();
        return;
      }

      // Otherwise Supabase emailed a confirmation link — prompt them to check it.
      setStatus("confirm");
      setMessage("Check your email to confirm and finish signing up.");
      startConfirmCooldown();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Unable to create account.");
    }
  }

  // Contextual hero: when a visitor arrives via /signup?ref=<brand-slug>
  // and we successfully resolved that brand server-side, lead with the
  // brand's name + accent gradient + 2-3 perks instead of generic "Join
  // the inner circle" copy. Falls through to the generic header below
  // when there's no referrer brand.
  const showContextualHero = !!referrerBrand;
  const ctaGradient = referrerBrand
    ? `linear-gradient(90deg, ${referrerBrand.accentFrom}, ${referrerBrand.accentTo})`
    : null;

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 px-6 py-12">
      {showContextualHero && referrerBrand && ctaGradient && (
        <section
          className="relative overflow-hidden rounded-3xl border border-white/10 p-6"
          style={{
            backgroundImage: `linear-gradient(135deg, ${referrerBrand.accentFrom}33, #0f172a 60%, #000000)`,
          }}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-white/70">
            Member club
          </p>
          <h2
            className="mt-2 text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Join {referrerBrand.name}&apos;s
            {" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: ctaGradient }}
            >
              member club
            </span>
          </h2>
          {referrerBrand.tagline && (
            <p className="mt-2 text-sm text-white/75">{referrerBrand.tagline}</p>
          )}
          <ul className="mt-4 space-y-1.5 text-sm text-white/80">
            <li className="flex items-start gap-2">
              <span aria-hidden>🎁</span>
              <span>Member-only perks, drops, and brand updates</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden>⭐</span>
              <span>Earn points on every visit and unlock rewards</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden>👋</span>
              <span>Free · 60 seconds · No credit card</span>
            </li>
          </ul>
        </section>
      )}

      <div className="glass-card space-y-6 p-8">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-white/60">Brand Engage Pro</p>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            {next === "/onboarding"
              ? "Create your account to continue"
              : showContextualHero
                ? "Create your account"
                : "Join the member club"}
          </h1>
          {next === "/onboarding" && (
            <p className="rounded-2xl border border-aurora/30 bg-aurora/10 px-3 py-2 text-sm text-white/80">
              Next up: your member profile — rewards, check-ins, and brand perks.
              Create a free account to continue.
            </p>
          )}
          {!showContextualHero && next !== "/onboarding" && (
            <p className="text-sm text-white/70">
              Create an account to earn points, unlock rewards, and get member-only updates.
            </p>
          )}
          {!showContextualHero && next !== "/onboarding" && (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-aurora/30 bg-aurora/10 px-3 py-1 text-xs font-medium text-aurora">
              🎁 Join free and unlock your first member perk today.
            </p>
          )}
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


        {/* OAuth temporarily hidden — Google + Apple SSO buttons removed
            until BEP's custom auth domain ships. The Supabase project
            URL (enfpviapxvqyoarwwsuf.supabase.co) currently appears in
            the Google consent screen's "to continue to" line, which
            reads as phishy to real users.

            Re-enable by reverting this comment block to the original
            JSX once Supabase Pro custom auth domain is configured
            (e.g. auth.brandengagepro.com or similar) and the Google
            OAuth client's redirect URIs point at the new domain. The
            original block in git history at the commit before this one. */}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-white/60">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(validateEmail(e.target.value));
              }}
              onBlur={() => setEmailError(validateEmail(email))}
              aria-invalid={!!emailError}
              className={
                "w-full rounded-2xl border bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none " +
                (emailError
                  ? "border-rose-500/60 focus:border-rose-400"
                  : "border-white/10 focus:border-white/40")
              }
              placeholder="you@email.com"
            />
            {emailError && (
              <span className="text-xs text-rose-300">{emailError}</span>
            )}
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-white/60">Password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError(validatePassword(e.target.value));
              }}
              onBlur={() => setPasswordError(validatePassword(password))}
              aria-invalid={!!passwordError}
              className={
                "w-full rounded-2xl border bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none " +
                (passwordError
                  ? "border-rose-500/60 focus:border-rose-400"
                  : "border-white/10 focus:border-white/40")
              }
              placeholder="at least 8 characters"
            />
            {passwordError && (
              <span className="text-xs text-rose-300">{passwordError}</span>
            )}
            {password && !passwordError && (() => {
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
                  <span className="text-xs text-white/50">{t.label}</span>
                </div>
              );
            })()}
          </label>

          <TurnstileWidget
            onSuccess={handleTurnstileSuccess}
            onExpire={handleTurnstileExpire}
          />

          <button
            type="submit"
            disabled={status === "loading" || confirmCooldown > 0}
            className="w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass disabled:opacity-60"
          >
            {status === "loading"
              ? "Creating account…"
              : confirmCooldown > 0
                ? `Resend in ${confirmCooldown}s`
                : "Create account"}
          </button>
        </form>

        {status === "confirm" && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
            <p className="text-sm font-semibold text-emerald-200">
              Almost there — what happens next:
            </p>
            <ol className="mt-3 space-y-2 text-xs text-emerald-100/90">
              <li className="flex gap-2">
                <span className="font-mono text-emerald-300/70">1.</span>
                <span>Check your email and click the confirmation link we just sent.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-emerald-300/70">2.</span>
                <span>Set up your member profile — 60 seconds, no credit card.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-emerald-300/70">3.</span>
                <span>Unlock your first member perk and start earning points.</span>
              </li>
            </ol>
          </div>
        )}
        {message && status !== "confirm" && (
          <p
            className={`text-sm ${
              status === "error" ? "text-red-300" : "text-emerald-300"
            }`}
          >
            {message}
          </p>
        )}

        <p className="text-center text-xs text-white/40">
          By creating an account, you agree to our{" "}
          <Link href="/terms" className="underline-offset-4 hover:underline hover:text-white/60">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline-offset-4 hover:underline hover:text-white/60">
            Privacy Policy
          </Link>
          .
        </p>
        <p className="text-center text-sm text-white/60">
          Already have an account?{" "}
          <Link href={loginHref} className="text-white underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
