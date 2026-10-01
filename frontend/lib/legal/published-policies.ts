import type { PolicyPage } from "@/lib/data/policies";
import { CANCELLATION_REFUND_MD } from "./cancellation-refund";

/**
 * Repo copy of the Cancellation & Refund Policy.
 *
 * Public /cancellation-refund renders this when the database row is
 * missing, still a draft, or still the placeholder. A non-draft row whose
 * opening is not the placeholder wins, so counsel can later paste final
 * text in admin without a code change.
 *
 * Draft PR #80 (cursor/terms-and-cookie-policy-fdbb) adds Terms and Cookie
 * records to this same file. Rebase this file after that pull request merges.
 */

export { policyForDisplay } from "./policy-display";

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
