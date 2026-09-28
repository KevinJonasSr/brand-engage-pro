/**
 * Server-side validation for the public /for-brands/apply form.
 *
 * The browser enforces some of this too, but that is only for the user's
 * convenience. Anyone can post to the server action directly, so every limit
 * here is enforced again on the server.
 */

export const SOCIAL_PLATFORMS = [
  "Instagram",
  "Facebook",
  "TikTok",
  "YouTube",
  "X",
  "LinkedIn",
] as const;

export const BRAND_CATEGORIES = [
  "restaurant",
  "retail",
  "hospitality",
  "entertainment",
  "service",
  "other",
] as const;

/** Maximum characters per text field. Keep in sync with apply-form.tsx. */
export const BRAND_APPLICATION_LIMITS = {
  display_name: 120,
  slug_suggestion: 60,
  tagline: 140,
  bio: 1000,
  hero_image: 500,
  contact_name: 120,
  contact_email: 254,
  contact_phone: 40,
  category: 40,
  primary_city: 120,
  loyalty_program_experience: 120,
  expected_launch_date: 60,
  referral_source: 200,
  community_pitch: 1500,
  social: 300,
} as const;

const INT_BOUNDS = {
  location_count: { min: 1, max: 10_000 },
  years_in_business: { min: 0, max: 500 },
  monthly_transactions: { min: 0, max: 100_000_000 },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+().\-\s]{7,40}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Control characters, except tab, newline and carriage return (allowed in textareas).
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export type BrandApplicationError =
  | "missing-required"
  | "too-long"
  | "invalid-email"
  | "invalid-phone"
  | "invalid-url"
  | "invalid-number"
  | "invalid-slug"
  | "invalid-category"
  | "invalid-text";

export type BrandApplicationRow = {
  display_name: string;
  slug_suggestion: string | null;
  tagline: string | null;
  bio: string | null;
  hero_image: string | null;
  social: { label: string; href: string }[];
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  category: string | null;
  location_count: number | null;
  primary_city: string | null;
  years_in_business: number | null;
  monthly_transactions: number | null;
  loyalty_program_experience: string | null;
  has_street_team: boolean;
  expected_launch_date: string | null;
  referral_source: string | null;
  community_pitch: string | null;
};

export type BrandApplicationResult =
  | { ok: true; row: BrandApplicationRow }
  | { ok: false; error: BrandApplicationError };

type TextField = keyof typeof BRAND_APPLICATION_LIMITS;

class ValidationError extends Error {
  readonly code: BrandApplicationError;
  constructor(code: BrandApplicationError) {
    super(code);
    this.code = code;
  }
}

function fail(code: BrandApplicationError): never {
  throw new ValidationError(code);
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function readText(form: FormData, key: string, limitKey: TextField): string | null {
  const raw = form.get(key);
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.length > BRAND_APPLICATION_LIMITS[limitKey]) fail("too-long");
  if (CONTROL_RE.test(value)) fail("invalid-text");
  return value;
}

function readInt(form: FormData, key: keyof typeof INT_BOUNDS): number | null {
  const raw = form.get(key);
  if (typeof raw !== "string" || !raw.trim()) return null;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) fail("invalid-number");
  const n = Number(value);
  const { min, max } = INT_BOUNDS[key];
  if (!Number.isSafeInteger(n) || n < min || n > max) fail("invalid-number");
  return n;
}

function readUrl(form: FormData, key: string, limitKey: TextField): string | null {
  const value = readText(form, key, limitKey);
  if (value && !isHttpUrl(value)) fail("invalid-url");
  return value;
}

function buildRow(form: FormData): BrandApplicationRow {
  const display_name = readText(form, "display_name", "display_name");
  const contact_name = readText(form, "contact_name", "contact_name");
  const contact_email = readText(form, "contact_email", "contact_email");
  if (!display_name || !contact_name || !contact_email) fail("missing-required");
  if (!EMAIL_RE.test(contact_email)) fail("invalid-email");

  const contact_phone = readText(form, "contact_phone", "contact_phone");
  if (contact_phone && !PHONE_RE.test(contact_phone)) fail("invalid-phone");

  const slug_suggestion = readText(form, "slug_suggestion", "slug_suggestion");
  if (slug_suggestion && !SLUG_RE.test(slug_suggestion)) fail("invalid-slug");

  const category = readText(form, "category", "category");
  if (category && !(BRAND_CATEGORIES as readonly string[]).includes(category)) {
    fail("invalid-category");
  }

  const social = SOCIAL_PLATFORMS.flatMap((platform) => {
    const href = readUrl(form, `social_${platform.toLowerCase()}`, "social");
    return href ? [{ label: platform, href }] : [];
  });

  return {
    display_name,
    slug_suggestion,
    tagline: readText(form, "tagline", "tagline"),
    bio: readText(form, "bio", "bio"),
    hero_image: readUrl(form, "hero_image", "hero_image"),
    social,
    contact_name,
    contact_email: contact_email.toLowerCase(),
    contact_phone,
    category,
    location_count: readInt(form, "location_count"),
    primary_city: readText(form, "primary_city", "primary_city"),
    years_in_business: readInt(form, "years_in_business"),
    monthly_transactions: readInt(form, "monthly_transactions"),
    loyalty_program_experience: readText(
      form,
      "loyalty_program_experience",
      "loyalty_program_experience",
    ),
    has_street_team: form.get("has_street_team") === "on",
    expected_launch_date: readText(form, "expected_launch_date", "expected_launch_date"),
    referral_source: readText(form, "referral_source", "referral_source"),
    community_pitch: readText(form, "community_pitch", "community_pitch"),
  };
}

/** Validate and normalise a submitted application. Never throws. */
export function parseBrandApplication(form: FormData): BrandApplicationResult {
  try {
    return { ok: true, row: buildRow(form) };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.code };
    throw err;
  }
}

/** Plain-English message for each error code, shown above the form. */
export const BRAND_APPLICATION_ERROR_MESSAGES: Record<string, string> = {
  "missing-required": "Please fill in your brand name, your name, and your email.",
  "too-long": "One of your answers is too long. Please shorten it and try again.",
  "invalid-email": "Please enter a valid email address.",
  "invalid-phone": "Please enter a valid phone number.",
  "invalid-url": "Links must be full web addresses that start with https://.",
  "invalid-number": "Please enter whole numbers for locations, years, and monthly transactions.",
  "invalid-slug": "The suggested web address can only use lowercase letters, numbers, and dashes.",
  "invalid-category": "Please pick a category from the list.",
  "invalid-text": "One of your answers has characters we cannot accept. Please retype it.",
  "rate-limited": "We have received several applications from you already. Please try again in an hour.",
  "verification-failed": "We could not confirm you are a person. Please try again.",
  "submit-failed": "Something went wrong saving your application. Please try again.",
};
