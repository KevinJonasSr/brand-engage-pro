import type { PolicyPage } from "@/lib/data/policies";
import { CANCELLATION_REFUND_MD } from "./cancellation-refund";
import { COOKIE_POLICY_MD } from "./cookie-policy";
import { policyForDisplay } from "./policy-display";
import { PRIVACY_POLICY_MD } from "./privacy-policy";
import { TERMS_OF_USE_MD } from "./terms-of-use";

/**
 * Repo copy of Terms, Privacy, Cookie Policy, and Cancellation & Refund.
 *
 * Public pages render these when the database row is missing, still a draft,
 * or still the placeholder. A non-draft row whose opening is not the
 * placeholder wins, so counsel can later paste final text in admin without a
 * code change and without SQL.
 *
 * Privacy is the exception for one known row. The live 2026-10-11 policy is
 * already published, so the placeholder rule would leave it on the site.
 * Rows last updated before PRIVACY_REPLACES_DB_UPDATED_BEFORE yield to this
 * repo copy. A super-admin save at /admin/policies/privacy sets updated_at
 * and that saved text is what /privacy and signup consent show next.
 */

export { policyForDisplay } from "./policy-display";

/**
 * The live privacy row's page chrome is "Last updated 10/11/2026."
 * Any privacy row saved before this instant is that pre-scrub publication.
 */
export const PRIVACY_REPLACES_DB_UPDATED_BEFORE = "2026-10-18T00:00:00.000Z";

export const PRIVACY_POLICY: PolicyPage = {
  slug: "privacy",
  title: "Privacy Policy",
  content_md: PRIVACY_POLICY_MD,
  effective_date: "2026-10-11",
  is_draft: false,
  updated_at: "2026-10-18T00:00:00.000Z",
};

export function privacyForDisplay(row: PolicyPage | null): PolicyPage {
  return policyForDisplay(row, PRIVACY_POLICY, {
    replaceDbUpdatedBefore: PRIVACY_REPLACES_DB_UPDATED_BEFORE,
  });
}

export const TERMS_POLICY: PolicyPage = {
  slug: "terms",
  title: "Terms of Service",
  content_md: TERMS_OF_USE_MD,
  effective_date: null,
  is_draft: false,
  // Live FEP page chrome: "Last updated 9/17/2026."
  updated_at: "2026-09-17T00:00:00.000Z",
};

export const COOKIE_POLICY: PolicyPage = {
  slug: "cookie_policy",
  title: "Cookie Policy",
  content_md: COOKIE_POLICY_MD,
  effective_date: "2026-09-18",
  is_draft: false,
  // Live FEP page chrome: "Last updated 9/15/2026."
  updated_at: "2026-09-15T00:00:00.000Z",
};

export const CANCELLATION_POLICY: PolicyPage = {
  slug: "cancellation_refund",
  title: "Cancellation & Refund Policy",
  content_md: CANCELLATION_REFUND_MD,
  // Live FEP page chrome: "Effective 8/3/2026."
  effective_date: "2026-08-03",
  is_draft: false,
  // Live FEP page chrome: "Last updated 8/1/2026."
  updated_at: "2026-08-01T00:00:00.000Z",
};
