"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Star } from "lucide-react";
import FirstSessionChecklist from "@/components/first-session-checklist";
import {
  EMPTY_FIRST_SESSION_FACTS,
  type FirstSessionFacts,
} from "@/lib/first-session";
import {
  FAVORITE_BRAND_OPTIONS,
  isOnboardingComplete,
  onboardingResumeStep,
  wizardFormFromMember,
  type OnboardingMemberRow,
} from "@/lib/onboard-profile";

type Field = {
  label: string;
  name: string;
  placeholder?: string;
  type: "text" | "email" | "tel" | "radio" | "select";
  options?: string[];
  otherOptionLabel?: string;
  otherFieldName?: string;
  otherPlaceholder?: string;
  required?: boolean;
  readOnly?: boolean;
  hint?: string;
};

const steps: { title: string; description: string; fields: Field[] }[] = [
  {
    title: "Member Profile",
    description: "Capture the basics so the experience can personalize immediately.",
    fields: [
      {
        label: "Preferred name",
        name: "firstName",
        placeholder: "Taylor",
        type: "text",
        required: true,
      },
      {
        label: "Email",
        name: "email",
        placeholder: "taylor@email.com",
        type: "email",
        readOnly: true,
        hint: "From your account.",
      },
      {
        label: "City & state",
        name: "city",
        placeholder: "Austin, TX",
        type: "text",
      },
    ],
  },
  {
    title: "Interests",
    description: "Members choose what they care about—rewards, marketplace drops, live moments.",
    fields: [
      {
        label: "Pick a lane",
        name: "interest",
        placeholder: "Rewards, VIP, Marketplace",
        type: "text",
        required: true,
      },
      {
        label: "What are your favorite Brands?",
        name: "favoriteBrand",
        type: "radio",
        options: FAVORITE_BRAND_OPTIONS,
        otherOptionLabel: "Other",
        otherFieldName: "favoriteBrandOther",
        otherPlaceholder: "Tell us your favorite brand or category",
      },
    ],
  },
  {
    title: "Access & Loyalty",
    description: "Tie their phone and socials to automate points + referrals.",
    fields: [
      {
        label: "Phone number",
        name: "phone",
        placeholder: "+1 (615) 555-0123",
        type: "tel",
        hint: "Recommended — unlocks SMS perks for brand drops, events, and rewards.",
      },
      {
        label: "TikTok or Instagram handle",
        name: "handle",
        placeholder: "@supermember",
        type: "text",
      },
      {
        label: "Birthday month",
        name: "birthdayMonth",
        type: "select",
        options: [
          "1|January",
          "2|February",
          "3|March",
          "4|April",
          "5|May",
          "6|June",
          "7|July",
          "8|August",
          "9|September",
          "10|October",
          "11|November",
          "12|December",
        ],
        hint: "Needed for the birthday entrée (up to $30) during your birthday month.",
      },
    ],
  },
];

export default function OnboardingWizard({
  initialForm = {},
  initialStep = 0,
  initialFacts = EMPTY_FIRST_SESSION_FACTS,
}: {
  initialForm?: Record<string, string>;
  initialStep?: number;
  initialFacts?: FirstSessionFacts;
}) {
  const [stepIndex, setStepIndex] = useState(initialStep);
  const [formState, setFormState] = useState<Record<string, string>>(initialForm);
  const [sessionFacts, setSessionFacts] = useState<FirstSessionFacts>(initialFacts);
  const [smsStatus, setSmsStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [smsMessage, setSmsMessage] = useState("Ready to send the confirmation text.");
  const [finishStatus, setFinishStatus] = useState<"idle" | "saving" | "error">("idle");
  const [finishMessage, setFinishMessage] = useState<string | null>(null);
  const [tosConsent, setTosConsent] = useState(false);
  // Email comes from the server page (auth.users). When present the field
  // stays readOnly. When missing, it is editable AND required so
  // onboarding doesn't dead-end. No client getUser() bounce — that
  // self-redirected mid-form when the session cookie flickered.
  const [emailAutoFilled] = useState(Boolean(initialForm.email?.trim()));
  const [smsConsent, setSmsConsent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/member-engage/onboard", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: {
        complete?: boolean;
        member?: OnboardingMemberRow | null;
        form?: Record<string, string>;
        facts?: FirstSessionFacts;
      } | null) => {
        if (cancelled || !body) return;
        if (body.complete || isOnboardingComplete(body.member ?? null)) {
          window.location.replace("/");
          return;
        }
        const nextForm =
          body.form ??
          wizardFormFromMember(body.member ?? null, initialForm.email);
        if (!formState.firstName?.trim() && nextForm.firstName?.trim()) {
          setFormState((prev) => ({ ...nextForm, ...prev, ...Object.fromEntries(
            Object.entries(nextForm).filter(([, value]) => Boolean(value)),
          ) }));
          setStepIndex((prev) => Math.max(prev, onboardingResumeStep(nextForm)));
        }
        if (body.facts) {
          setSessionFacts((prev) => ({
            ...prev,
            ...body.facts,
            hasProfile:
              Boolean(nextForm.firstName?.trim()) ||
              Boolean(body.facts?.hasProfile) ||
              prev.hasProfile,
          }));
        }
      })
      .catch(() => {
        /* keep server-provided form; do not remount blank */
      });
    return () => {
      cancelled = true;
    };
    // One-shot hard-reload recovery — do not re-run when the user types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentStep = steps[stepIndex];
  const progress = useMemo(() => ((stepIndex + 1) / steps.length) * 100, [stepIndex]);

  const handleInput = (name: string, value: string) => {
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  /**
   * Resolves the favorite-brand selection. If the user picked "Other" and
   * filled in the freeform text, returns that text; otherwise returns the
   * selected option (or null if nothing was picked).
   */
  const resolveFavoriteBrand = (): string | null => {
    const sel = formState.favoriteBrand;
    if (!sel) return null;
    if (sel === "Other") {
      const other = formState.favoriteBrandOther?.trim();
      return other && other.length > 0 ? other : "Other";
    }
    return sel;
  };

  /**
   * Returns true if all required fields in the current step are filled.
   * Drives the disabled state of the "Continue" button.
   */
  const canAdvanceCurrentStep = (): boolean => {
    return currentStep.fields.every((field) => {
      // Email needs to be effectively-required when editable
      // (i.e. auth prefill failed). Field's `required` flag stays
      // false in the steps array so the * doesn't render in the
      // prefilled case; we gate Continue here instead.
      if (field.name === "email" && !emailAutoFilled) {
        const v = formState.email?.trim() ?? "";
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      }
      if (!field.required) return true;
      if (field.type === "radio") {
        const sel = formState[field.name];
        if (!sel) return false;
        if (sel === field.otherOptionLabel) {
          return Boolean(field.otherFieldName && formState[field.otherFieldName]?.trim());
        }
        return true;
      }
      return Boolean(formState[field.name]?.trim());
    });
  };

  const persistProfileDraft = () => {
    const favoriteBrand = resolveFavoriteBrand();
    fetch("/api/member-engage/onboard", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: formState.firstName,
        city: formState.city,
        ...(favoriteBrand ? { favoriteBrand } : {}),
        ...(formState.interest ? { interest: formState.interest } : {}),
        draft: true,
      }),
    }).catch((err) => {
      console.warn("Onboarding draft did not persist:", err);
    });
  };

  const nextStep = () => {
    persistProfileDraft();
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };
  const prevStep = () => setStepIndex((prev) => Math.max(prev - 1, 0));

  const handleSmsOptIn = async () => {
    if (!formState.phone) {
      setSmsStatus("error");
      setSmsMessage("Add a phone number to trigger the confirmation message.");
      return;
    }

    try {
      setSmsStatus("loading");
      setSmsMessage("Sending confirmation text...");
      const response = await fetch("/api/member-engage/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formState.phone,
          firstName: formState.firstName,
          interest: formState.interest,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send SMS");
      }

      setSmsStatus("success");
      setSmsMessage("Confirmation text delivered. Member is live in the journey.");

      if (formState.email) {
        fetch("/api/member-engage/mailchimp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: formState.email,
            firstName: formState.firstName,
            tags: formState.interest ? [formState.interest] : undefined,
          }),
        }).catch((err) => {
          console.warn("Mailchimp subscribe did not complete:", err);
        });
      }

      const refCode =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("ref") ?? undefined
          : undefined;
      fetch("/api/member-engage/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formState.firstName,
          city: formState.city,
          phone: formState.phone,
          handle: formState.handle,
          favoriteBrand: resolveFavoriteBrand(),
          interest: formState.interest,
          referralCode: refCode,
          birthdayMonth: formState.birthdayMonth || undefined,
          smsOptedIn: true,
          emailOptedIn: Boolean(formState.email),
        }),
      }).catch((err) => {
        console.warn("Onboarding completion did not persist:", err);
      });
    } catch (error) {
      console.error(error);
      setSmsStatus("error");
      setSmsMessage("Twilio did not accept the request. Double-check the number and try again.");
    }
  };

  const handleFinish = async () => {
    if (!tosConsent) {
      setFinishStatus("error");
      setFinishMessage("Please agree to the Terms of Service and Privacy Policy to finish.");
      return;
    }

    try {
      setFinishStatus("saving");
      setFinishMessage(null);

      const refFromUrl =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("ref") ?? undefined
          : undefined;
      const refFromCookie =
        typeof document !== "undefined"
          ? document.cookie
              .split("; ")
              .find((c) => c.startsWith("memberengage_ref="))
              ?.split("=")[1]
          : undefined;
      const refCode = refFromUrl ?? refFromCookie;
      const onboardRes = await fetch("/api/member-engage/onboard", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formState.firstName,
          city: formState.city,
          phone: formState.phone,
          handle: formState.handle,
          favoriteBrand: resolveFavoriteBrand(),
          interest: formState.interest,
          referralCode: refCode,
          birthdayMonth: formState.birthdayMonth || undefined,
          smsOptedIn: Boolean(formState.phone) && smsConsent,
          emailOptedIn: Boolean(formState.email),
          consentAcceptedAt: new Date().toISOString(),
          consentVersion: "2026-04-22.v1",
        }),
      });

      const body = (await onboardRes.json().catch(() => ({}))) as {
        error?: string;
        member?: { first_name?: string | null; interest?: string | null };
      };

      if (!onboardRes.ok) {
        setFinishMessage(
          typeof body.error === "string"
            ? body.error
            : `Onboarding save failed (${onboardRes.status})`,
        );
        throw new Error(body.error ?? `Onboarding save failed (${onboardRes.status})`);
      }

      const savedName = body.member?.first_name?.trim() ?? "";
      const savedInterest = body.member?.interest?.trim() ?? "";
      if (
        (formState.firstName?.trim() && savedName !== formState.firstName.trim()) ||
        (formState.interest?.trim() && savedInterest !== formState.interest.trim())
      ) {
        setFinishMessage(
          "Your name or interests did not save. Please try Finish again.",
        );
        throw new Error("Onboarding persist mismatch");
      }

      if (refFromCookie && typeof document !== "undefined") {
        document.cookie = "memberengage_ref=; path=/; max-age=0";
      }

      if (formState.email) {
        const tags = ["welcome"];
        if (formState.interest) tags.push(formState.interest);
        fetch("/api/member-engage/mailchimp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: formState.email,
            firstName: formState.firstName,
            tags,
          }),
        }).catch((err) => console.warn("Mailchimp subscribe did not complete:", err));
      }

      if (formState.phone) {
        fetch("/api/member-engage/sms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: formState.phone,
            firstName: formState.firstName,
            interest: formState.interest,
          }),
        }).catch((err) => console.warn("Twilio SMS did not complete:", err));
      }

      window.location.assign("/");
    } catch (error) {
      console.error(error);
      setFinishStatus("error");
    }
  };

  const isLastStep = stepIndex === steps.length - 1;
  const stepValid = canAdvanceCurrentStep();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 lg:flex-row">
        <section className="w-full max-w-3xl rounded-3xl border border-white/10 bg-black/40 p-8">
          <div className="flex items-center justify-between text-sm uppercase tracking-[0.3em] text-white/60">
            <span>Onboarding wizard</span>
            <span>{Math.round(progress)}% complete</span>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-8 space-y-6">
            <div>
              <p className="text-sm uppercase tracking-wide text-white/60">Step {stepIndex + 1}</p>
              <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                {currentStep.title}
              </h1>
              <p className="mt-2 text-white/70">{currentStep.description}</p>
            </div>

            <div className="space-y-4">
              {currentStep.fields.map((field) => {
                if (field.type === "radio" && field.options) {
                  const selected = formState[field.name] ?? "";
                  const isOther = selected === field.otherOptionLabel;
                  return (
                    <div key={field.name} className="block text-sm text-white/80">
                      <p>
                        {field.label}
                        {field.required && <span className="ml-1 text-rose-300">*</span>}
                      </p>
                      <div className="mt-2 space-y-2">
                        {field.options.map((opt) => (
                          <label
                            key={opt}
                            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10"
                          >
                            <input
                              type="radio"
                              name={field.name}
                              value={opt}
                              checked={selected === opt}
                              onChange={() => handleInput(field.name, opt)}
                              className="h-4 w-4 accent-aurora"
                            />
                            <span className="text-white/90">{opt}</span>
                          </label>
                        ))}
                        {isOther && field.otherFieldName && (
                          <input
                            type="text"
                            value={formState[field.otherFieldName] ?? ""}
                            onChange={(event) =>
                              handleInput(field.otherFieldName!, event.target.value)
                            }
                            placeholder={field.otherPlaceholder ?? "Other"}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
                          />
                        )}
                      </div>
                    </div>
                  );
                }
                if (field.type === "select" && field.options) {
                  return (
                    <label key={field.name} className="block text-sm text-white/80">
                      <span>{field.label}</span>
                      <select
                        value={formState[field.name] ?? ""}
                        onChange={(event) => handleInput(field.name, event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-white/40 focus:outline-none"
                      >
                        <option value="">Select month</option>
                        {field.options.map((opt) => {
                          const [value, label] = opt.split("|");
                          return (
                            <option key={value} value={value}>
                              {label ?? value}
                            </option>
                          );
                        })}
                      </select>
                      {field.hint && (
                        <span className="mt-1 block text-xs text-white/50">{field.hint}</span>
                      )}
                    </label>
                  );
                }
                return (
                  <label key={field.name} className="block text-sm text-white/80">
                    <span>
                      {field.label}
                      {field.required && <span className="ml-1 text-rose-300">*</span>}
                    </span>
                    {(() => {
                      // Email is the only field with a runtime-overridable
                      // readOnly. Lock it when prefilled, leave it
                      // editable + required when not.
                      const fieldReadOnly =
                        field.readOnly &&
                        (field.name !== "email" || emailAutoFilled);
                      return (
                        <input
                          type={field.type}
                          value={formState[field.name] ?? ""}
                          onChange={(event) => handleInput(field.name, event.target.value)}
                          placeholder={field.placeholder}
                          readOnly={fieldReadOnly}
                          required={
                            field.required ||
                            (field.name === "email" && !emailAutoFilled)
                          }
                          className={`mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-white/40 focus:outline-none ${
                            fieldReadOnly ? "cursor-not-allowed text-white/60" : ""
                          }`}
                        />
                      );
                    })()}
                    {field.hint && (
                      <span className="mt-1 block text-xs text-white/50">
                        {field.name === "email" && !emailAutoFilled
                          ? "We'll use this to send your weekly digest and confirmations."
                          : field.hint}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {isLastStep && (
              <div className="space-y-2 rounded-2xl bg-black/30 p-4 text-xs text-white/75">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={tosConsent}
                    onChange={(e) => setTosConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-aurora"
                  />
                  <span>
                    I agree to the{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noreferrer"
                      className="text-aurora underline"
                    >
                      Terms of Service
                    </a>{" "}
                    and{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noreferrer"
                      className="text-aurora underline"
                    >
                      Privacy Policy
                    </a>
                    .
                  </span>
                </label>
                {formState.phone && (
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={smsConsent}
                      onChange={(e) => setSmsConsent(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-aurora"
                    />
                    <span>
                      I consent to receive SMS from Brand Engage Pro about brand drops, events, and
                      rewards. Msg &amp; data rates may apply. Reply STOP to opt out.
                    </span>
                  </label>
                )}
              </div>
            )}

            {isLastStep && (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3 text-sm text-white/70">
              <Star className="text-amber-300" size={18} />
              <p>SMS double opt-in</p>
            </div>
            <p className="mt-3 text-sm text-white/60">{smsMessage}</p>
            <button
              onClick={handleSmsOptIn}
              className="mt-4 rounded-full border border-white/30 px-4 py-2 text-sm text-white/80 disabled:opacity-40"
              disabled={smsStatus === "loading"}
            >
              {smsStatus === "loading" ? "Sending..." : "Send confirmation text"}
            </button>
            {smsStatus === "success" && (
              <p className="mt-2 text-sm text-emerald-300">Opt-in confirmed via Twilio.</p>
            )}
            {smsStatus === "error" && (
              <p className="mt-2 text-sm text-rose-300">Issue sending SMS. Try again.</p>
            )}
          </div>
            )}

            <div className="flex flex-col gap-2 pt-4">
              <div className="flex items-center justify-between gap-4">
                <button
                  className="text-sm text-white/60 disabled:opacity-30"
                  disabled={stepIndex === 0}
                  onClick={prevStep}
                >
                  Back
                </button>
                {isLastStep ? (
                  <button
                    type="button"
                    onClick={handleFinish}
                    disabled={finishStatus === "saving"}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110 disabled:opacity-50"
                  >
                    {finishStatus === "saving" ? "Saving…" : "Finish onboarding"}
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    onClick={nextStep}
                    disabled={!stepValid}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue <ArrowRight size={16} />
                  </button>
                )}
              </div>
              {!isLastStep && !stepValid && (
                <p className="text-right text-xs text-white/50">
                  Fill in the required fields (
                  <span className="text-rose-300">*</span>) to continue.
                </p>
              )}
            </div>
            {finishStatus === "error" && (
              <p className="text-sm text-rose-300">
                {finishMessage ?? (
                  <>
                    Could not save your profile. Are you still signed in? Try{" "}
                    <a href="/login" className="underline">signing in</a> and retrying.
                  </>
                )}
              </p>
            )}
          </div>

        </section>

        <aside className="flex-1 space-y-6">
          <FirstSessionChecklist
            dismissible={false}
            facts={{
              ...sessionFacts,
              hasProfile:
                sessionFacts.hasProfile || Boolean(formState.firstName?.trim()),
            }}
          />
        </aside>
      </div>
    </div>
  );
}
