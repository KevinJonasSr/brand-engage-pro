"use client";

import { useState } from "react";
import { submitBrandApplicationAction } from "./actions";

const CATEGORIES = [
  { value: "restaurant", label: "Restaurant / Hospitality" },
  { value: "retail", label: "Retail / E-commerce" },
  { value: "hospitality", label: "Hotel / Travel" },
  { value: "entertainment", label: "Entertainment / Media" },
  { value: "service", label: "Service Business" },
  { value: "other", label: "Other" },
] as const;

const LOYALTY_OPTIONS = [
  "None — first time running loyalty",
  "Spreadsheet / paper punch cards",
  "Square Loyalty",
  "Toast Loyalty",
  "Other POS-native program",
  "Standalone loyalty platform",
];

/**
 * Brand application form.
 * Pure client component — uses native FormData submission via the
 * server action. No JS validation library — keeps the bundle tiny
 * and falls back gracefully if JS fails to load.
 */
export default function ApplyForm() {
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action={submitBrandApplicationAction}
      onSubmit={() => setSubmitting(true)}
      className="space-y-8"
    >
      {/* Basics */}
      <Section title="Brand basics">
        <Field label="Brand name *" name="display_name" required maxLength={120} />
        <Field
          label="Tagline (one short line)"
          name="tagline"
          maxLength={140}
          hint="e.g. Family-style Southern soul food in Belmont, NC."
        />
        <Field
          label="Short bio"
          name="bio"
          textarea
          maxLength={1000}
          hint="A paragraph or two. Voice + story matter more than corporate-speak."
        />
        <Field
          label="Suggested slug"
          name="slug_suggestion"
          hint="Lowercase, dashes, no spaces. e.g. nellies-southern-kitchen. We'll confirm before going live."
          maxLength={60}
        />
        <Field
          label="Hero image URL (optional)"
          name="hero_image"
          hint="Paste a public URL. You'll upload via /admin once approved."
        />
      </Section>

      {/* Contact */}
      <Section title="Primary contact">
        <Field label="Name *" name="contact_name" required maxLength={120} />
        <Field label="Email *" name="contact_email" type="email" required />
        <Field label="Phone" name="contact_phone" />
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
          />
          <Field label="Primary city" name="primary_city" maxLength={120} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Years in business"
            name="years_in_business"
            type="number"
            min={0}
          />
          <Field
            label="Approx. monthly transactions"
            name="monthly_transactions"
            type="number"
            min={0}
            hint="Rough estimate is fine — helps us size your tier."
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
          maxLength={1500}
          hint="Tell us about your regulars. The story you can't put on a billboard."
        />
        <Field
          label="Expected launch date"
          name="expected_launch_date"
          hint="Free-form — 'next month', 'Q2 2026', or a specific date."
        />
        <Field
          label="How did you hear about us?"
          name="referral_source"
          hint="Who pointed you our way? Outbound, social, a friend?"
        />
      </Section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-white/55">
          By submitting you agree we may contact the email above. We never
          share your data with third parties.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit application →"}
        </button>
      </div>
    </form>
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
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  textarea?: boolean;
  maxLength?: number;
  min?: number;
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
