"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { submitBrandApplicationAction } from "./actions";
import { TurnstileWidget, isTurnstileConfigured } from "@/components/turnstile-widget";
import {
  BRAND_APPLICATION_ERROR_MESSAGES,
  BRAND_APPLICATION_LIMITS as LIMITS,
} from "@/lib/brand-application";

const CATEGORIES = [
  { value: "restaurant", label: "Restaurant / Hospitality" },
  { value: "retail", label: "Retail / E-commerce" },
  { value: "hospitality", label: "Hotel / Travel" },
  { value: "entertainment", label: "Entertainment / Media" },
  { value: "service", label: "Service Business" },
  { value: "other", label: "Other" },
] as const;

const LOYALTY_OPTIONS = [
  "None, this is our first loyalty program",
  "Spreadsheet / paper punch cards",
  "Square Loyalty",
  "Toast Loyalty",
  "Other POS-native program",
  "Standalone loyalty platform",
];

/**
 * Brand application form.
 * Client component that posts FormData to the server action. The browser
 * limits here are for convenience only; the server enforces them again.
 * No JS validation library, which keeps the bundle tiny
 * and falls back gracefully if JS fails to load.
 */
export default function ApplyForm({ errorCode }: { errorCode?: string }) {
  const [turnstileToken, setTurnstileToken] = useState("");
  // Only shown when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. The server only
  // checks the token when TURNSTILE_SECRET_KEY is set as well.
  const showTurnstile = isTurnstileConfigured();
  const waitingForTurnstile = showTurnstile && !turnstileToken;
  const errorMessage = errorCode
    ? (BRAND_APPLICATION_ERROR_MESSAGES[errorCode] ??
      BRAND_APPLICATION_ERROR_MESSAGES["submit-failed"])
    : null;

  return (
    <form
      action={submitBrandApplicationAction}
      className="space-y-8"
    >
      {errorMessage && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
        >
          {errorMessage}
        </p>
      )}
      {/* Basics */}
      <Section title="Brand basics">
        <Field label="Brand name *" name="display_name" required maxLength={LIMITS.display_name} />
        <Field
          label="Tagline (one short line)"
          name="tagline"
          maxLength={LIMITS.tagline}
          hint="e.g. Family-style Southern soul food in Belmont, NC."
        />
        <Field
          label="Short bio"
          name="bio"
          textarea
          maxLength={LIMITS.bio}
          hint="A paragraph or two. Voice + story matter more than corporate-speak."
        />
        <Field
          label="Suggested slug"
          name="slug_suggestion"
          hint="Lowercase, dashes, no spaces. e.g. nellies-southern-kitchen. We'll confirm before going live."
          maxLength={LIMITS.slug_suggestion}
        />
        <Field
          label="Hero image URL (optional)"
          name="hero_image"
          type="url"
          maxLength={LIMITS.hero_image}
          hint="Paste a link to a photo. You can upload photos yourself once we approve your brand."
        />
      </Section>

      {/* Contact */}
      <Section title="Primary contact">
        <Field label="Name *" name="contact_name" required maxLength={LIMITS.contact_name} />
        <Field label="Email *" name="contact_email" type="email" required maxLength={LIMITS.contact_email} />
        <Field label="Phone" name="contact_phone" type="tel" maxLength={LIMITS.contact_phone} />
      </Section>

      {/* Brand specifics */}
      <Section title="About your brand">
        <Select
          label="Category *"
          name="category"
          options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          required
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Number of locations"
            name="location_count"
            type="number"
            min={1}
            max={10000}
          />
          <Field label="Primary city" name="primary_city" maxLength={LIMITS.primary_city} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Years in business"
            name="years_in_business"
            type="number"
            min={0}
            max={500}
          />
          <Field
            label="Approx. monthly transactions"
            name="monthly_transactions"
            type="number"
            min={0}
            max={100000000}
            hint="A rough estimate is fine. It helps us pick the right plan for you."
          />
        </div>
        <Select
          label="Loyalty program experience"
          name="loyalty_program_experience"
          options={LOYALTY_OPTIONS.map((o) => ({ value: o, label: o }))}
        />
        <Checkbox
          label="We have a street team / brand-ambassador program"
          name="has_street_team"
        />
      </Section>

      {/* Social */}
      <Section title="Social handles">
        <p className="text-xs text-white/55">
          Paste full URLs. Leave blank for platforms you don&apos;t use.
        </p>
        {["Instagram", "Facebook", "TikTok", "YouTube", "X", "LinkedIn"].map(
          (platform) => (
            <Field
              key={platform}
              label={platform}
              name={`social_${platform.toLowerCase()}`}
              type="url"
              maxLength={LIMITS.social}
              hint={`https://${platform.toLowerCase()}.com/yourbrand`}
            />
          ),
        )}
      </Section>

      {/* Qualitative */}
      <Section title="The good stuff">
        <Field
          label="What makes your community special?"
          name="community_pitch"
          textarea
          maxLength={LIMITS.community_pitch}
          hint="Tell us about your regulars. The story you can't put on a billboard."
        />
        <Field
          label="Expected launch date"
          name="expected_launch_date"
          maxLength={LIMITS.expected_launch_date}
          hint="Anything works: 'next month', 'this spring', or a specific date."
        />
        <Field
          label="How did you hear about us?"
          name="referral_source"
          maxLength={LIMITS.referral_source}
          hint="Who pointed you our way? Outbound, social, a friend?"
        />
      </Section>

      {showTurnstile && (
        <div className="space-y-2">
          <input type="hidden" name="cf-turnstile-response" value={turnstileToken} />
          <TurnstileWidget
            onSuccess={setTurnstileToken}
            onExpire={() => setTurnstileToken("")}
            onError={() => setTurnstileToken("")}
            theme="dark"
          />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-white/55">
          By submitting you agree we may contact the email above. We never
          share your data with third parties.
        </p>
        <SubmitButton disabled={waitingForTurnstile} />
      </div>
    </form>
  );
}

/** Uses the form's pending state so the button re-enables after an error redirect. */
function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110 disabled:opacity-60"
    >
      {pending ? "Submitting…" : "Submit application →"}
    </button>
  );
}

// ─── Tiny field primitives ────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="glass-card space-y-4 rounded-2xl p-6">
      <legend className="text-xs uppercase tracking-[0.2em] text-white/60">
        {title}
      </legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  textarea,
  maxLength,
  min,
  max,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  textarea?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  hint?: string;
}) {
  const id = `f_${name}`;
  return (
    <label htmlFor={id} className="block">
      <span className="block text-sm font-medium text-white/85">{label}</span>
      {hint && (
        <span className="mt-0.5 block text-xs text-white/45">{hint}</span>
      )}
      {textarea ? (
        <textarea
          id={id}
          name={name}
          required={required}
          maxLength={maxLength}
          rows={4}
          className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-aurora focus:outline-none focus:ring-1 focus:ring-aurora"
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          maxLength={maxLength}
          min={min}
          max={max}
          className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-aurora focus:outline-none focus:ring-1 focus:ring-aurora"
        />
      )}
    </label>
  );
}

function Select({
  label,
  name,
  options,
  required,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  const id = `f_${name}`;
  return (
    <label htmlFor={id} className="block">
      <span className="block text-sm font-medium text-white/85">{label}</span>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue=""
        className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-aurora focus:outline-none focus:ring-1 focus:ring-aurora"
      >
        <option value="" disabled>
          Choose one…
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Checkbox({ label, name }: { label: string; name: string }) {
  return (
    <label className="flex items-start gap-3 text-sm text-white/85">
      <input
        type="checkbox"
        name={name}
        className="mt-1 h-4 w-4 rounded border-white/30 bg-black/40 accent-aurora"
      />
      <span>{label}</span>
    </label>
  );
}
