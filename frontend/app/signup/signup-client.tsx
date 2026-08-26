"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
  nextSignupTurnstileGate,
  scrollToTurnstileChallenge,
  shouldShowParentChallengeError,
  signupAllowsSubmit,
  signupTurnstileButtonLabel,
} from "@/lib/turnstile-ux";
import { safeRelativePath } from "@/lib/safe-redirect";
import { ConsentModal, type ConsentDoc } from "@/components/consent-modal";
import { CONSENT_COPY, consentReviewTitle } from "@/lib/consent-accept";
import { continueAfterPasswordSignup } from "@/lib/password-signup-continue";
import { resolveAppUrl } from "@/lib/site-url";

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
  consentDocs,
}: {
  referrerName?: string | null;
  referrerBrand?: ReferrerBrand | null;
  consentDocs?: ConsentDoc[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const community = searchParams.get("community");
  const ref = searchParams.get("ref");
  const rawNext = safeRelativePath(searchParams.get("next"), "");
  const next = rawNext || null;
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
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const appOrigin = resolveAppUrl();
  const [message, setMessage] = useState("");
  const turnstileRequired = isTurnstileRequired();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileLoadState, setTurnstileLoadState] =
    useState<TurnstileLoadState>("loading");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [consentOpen, setConsentOpen] = useState(false);
  const reviewDocs = consentDocs ?? [];
  // One-shot: Turnstile is verified before the consent modal opens so the
  // ~5min token can't expire while the user scrolls ToS. createAccount
  // consumes this flag instead of re-verifying after Accept.
  const captchaVerifiedRef = useRef(false);
  const handleTurnstileSuccess = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileError(false);
  }, []);
  const handleTurnstileError = useCallback(() => setTurnstileError(true), []);
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(null), []);
  const handleTurnstileLoadState = useCallback((state: TurnstileLoadState) => {
    setTurnstileLoadState(state);
    if (state === "loading" || state === "ready") {
      setTurnstileError(false);
    }
  }, []);
  const resetChallenge = useCallback(() => {
    setTurnstileToken(null);
    setTurnstileLoadState("loading");
    setTurnstileKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (turnstileRequired) prefetchTurnstileScript();
  }, [turnstileRequired]);

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

  const turnstileGate = nextSignupTurnstileGate({
    configured: turnstileRequired,
    token: turnstileToken,
    loadState: turnstileLoadState,
  });
  const canSubmitSignup = signupAllowsSubmit(turnstileGate);
  const reviewTitle = consentReviewTitle({
    brandSlug: referrerBrand?.slug ?? ref,
    brandName: referrerBrand?.name,
  });

  async function ensureCaptcha(): Promise<boolean> {
    if (captchaVerifiedRef.current) return true;
    const gate = nextSignupTurnstileGate({
      configured: turnstileRequired,
      token: turnstileToken,
      loadState: turnstileLoadState,
    });
    if (gate === "wait-load") {
      setStatus("error");
      setMessage("Security check is still loading. Hang on a moment, then try again.");
      requestAnimationFrame(() => scrollToTurnstileChallenge());
      return false;
    }
    if (gate === "complete-check") {
      setStatus("error");
      setMessage("Complete the security check, then try again.");
      requestAnimationFrame(() => scrollToTurnstileChallenge());
      return false;
    }
    // Widget failed / unavailable, or keys unset (preview/dev): do not block
    // account create on a missing token — ConsentModal can still open.
    if (gate === "fail-open" || gate === "not-configured") {
      captchaVerifiedRef.current = true;
      return true;
    }
    const captcha = await verifyTurnstileToken(turnstileToken);
    resetChallenge();
    if (!captcha.success) {
      captchaVerifiedRef.current = false;
      setStatus("error");
      setMessage(turnstileFailureMessage(captcha.error));
      requestAnimationFrame(() => scrollToTurnstileChallenge());
      return false;
    }
    captchaVerifiedRef.current = true;
    return true;
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

    // Verify Turnstile *before* the consent modal. Tokens are single-use and
    // ~5min TTL; reading ToS behind the modal would otherwise race the
    // widget (which sits under the overlay and can't be refreshed).
    setStatus("loading");
    setMessage("");
    const ok = await ensureCaptcha();
    if (!ok) return;

    // Explicit, logged consent is required before an account is created.
    // Hold here and let the consent modal drive the actual submit.
    setStatus("idle");
    setConsentOpen(true);
  }

  async function createAccount(consentVersion?: string) {
    setStatus("loading");
    setMessage("");

    // Prefer the pre-consent verification; fall back to a live verify when
    // createAccount is reached without that one-shot (shouldn't happen in
    // the normal consent path, but keeps the no-docs path safe on retry).
    if (!(await ensureCaptcha())) return;
    captchaVerifiedRef.current = false;

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Never $VERCEL_URL / vercel.app / apex — www only. Confirm-email
          // is not the member path (PKCE email links fail).
          emailRedirectTo: `${appOrigin}/auth/callback?next=${encodeURIComponent(postSignupHref)}`,
          data: consentVersion
            ? {
                consent_accepted_at: new Date().toISOString(),
                consent_version: consentVersion,
              }
            : undefined,
        },
      });
      if (error) throw error;

      const continued = await continueAfterPasswordSignup({
        session: data.session,
        email,
        password,
        signInWithPassword: (credentials) =>
          supabase.auth.signInWithPassword(credentials),
      });
      if (continued.ok) {
        router.push(postSignupHref);
        router.refresh();
        return;
      }

      setStatus("error");
      setMessage(continued.message);
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
              🎁 Finish your profile for +100 welcome points.
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

          {turnstileRequired && (
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
              {shouldShowParentChallengeError({
                loadState: turnstileLoadState,
                challengeFailed: turnstileError,
              }) && (
                <p className="text-xs text-rose-300">
                  Security check failed. Tap Retry above, or try again.
                </p>
              )}
              {turnstileGate === "fail-open" && (
                <p className="text-xs text-white/55">
                  Security check is unavailable. {CONSENT_COPY.failOpen}
                </p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "loading" || !canSubmitSignup}
            className="w-full rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-3 text-sm font-semibold text-white shadow-glass disabled:opacity-60"
          >
            {signupTurnstileButtonLabel({
              cooldown: 0,
              status,
              gate: turnstileGate,
            })}
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

        <p className="text-center text-xs text-white/55">
          By creating an account, you agree to our{" "}
          <Link href="/terms" className="text-white/80 underline underline-offset-4 hover:text-white">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-white/80 underline underline-offset-4 hover:text-white">
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

      <ConsentModal
        open={consentOpen}
        docs={reviewDocs}
        title={reviewTitle}
        onCancel={() => {
          setConsentOpen(false);
          // Token was already spent pre-modal; require a fresh check.
          captchaVerifiedRef.current = false;
          resetChallenge();
          setStatus("idle");
        }}
        onAccept={(version) => {
          setConsentOpen(false);
          void createAccount(version);
        }}
      />
    </main>
  );
}
