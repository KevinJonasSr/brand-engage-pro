import type { PolicyPage } from "@/lib/data/policies";
import { CANCELLATION_REFUND_MD } from "./cancellation-refund";
import { COOKIE_POLICY_MD } from "./cookie-policy";
import { TERMS_OF_USE_MD } from "./terms-of-use";

/**
 * Repo copy of Terms, Cookie Policy, and Cancellation & Refund Policy.
 *
 * Public /terms, /cookie-policy and /cancellation-refund render these when
 * the database row is missing, still a draft, or still the placeholder. A
 * non-draft row whose opening is not the placeholder wins, so counsel can
 * later paste final text in admin without a code change. The privacy page
 * does not use this.
 */

export { policyForDisplay } from "./policy-display";

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
