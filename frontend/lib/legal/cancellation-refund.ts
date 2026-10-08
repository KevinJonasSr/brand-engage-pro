/**
 * Cancellation & Refund Policy for Brand Engage Pro.
 *
 * Source: the live Fan Engage Pro page
 * https://www.fanengagepro.com/cancellation-refund as published on
 * 2026-10-01, plus the brand pricing Raymond and Kevin decided. The FEP
 * repository renders the original document from policy_pages and does not
 * store the legal text. Review notes are code comments, not page text.
 *
 * // LEGAL-REVIEW: Effective date. Carried from the live FEP page chrome
 * // (Effective 8/3/2026; last updated 8/1/2026). Counsel should set the
 * // BEP dates. The effective date is later than the last-updated date.
 * // LEGAL-REVIEW: Contracting entity. Raymond confirmed Fan Engage Pro LLC on 2026-10-01 (a Colorado limited liability company, the same entity as Fan Engage Pro). Kevin has not yet confirmed. The company sentences name Fan Engage Pro LLC. The product name stays Brand Engage Pro.
 * // LEGAL-REVIEW: Governing law. The live FEP page has no governing-law
 * // clause. None was added.
 */
export const CANCELLATION_REFUND_MD = [
  `# Cancellation & Refund Policy

`,
  // LEGAL-REVIEW: Billing. The "up to $100/month" model is confirmed by Raymond (Kevin informed via Raymond) and the exact wording needs attorney review before launch. Different plans, promotional pricing, specials, and the checkout price are part of that confirmed model.
  `## 1. Subscription price

Brand Engage Pro brands pay a monthly subscription of up to $100 per month. Fan Engage Pro LLC may offer different plans, promotional pricing, or specials. The price shown at checkout is the price that applies.

`,
  // LEGAL-REVIEW: Billing. Advance notice (for example 30 days by email), applying a change to the next billing period, and avoiding the new price by cancelling before it takes effect are part of the confirmed model. The exact wording needs attorney review before launch.
  `## 2. Price changes

Fan Engage Pro LLC may change prices with advance notice, for example 30 days by email. A price change applies to the next billing period. Cancelling before the change takes effect avoids the new price.

`,
  // LEGAL-REVIEW: Subscriber wording. Cancellation now follows the confirmed brand rule: brands can cancel at any time from account settings, and access continues to the end of the paid period. The FEP "Premium access" sentence was removed. "subscription", "billing period", and "account settings" still need attorney review before launch.
  `## 3. Cancelling your subscription

Brands can cancel a Brand Engage Pro subscription at any time from account settings. Access continues to the end of the paid period.

`,
  // LEGAL-REVIEW: Billing. The refusal of partial-period refunds and the 30-day charge-error window are carried from FEP. A promotion or special does not create a refund right. The exact wording needs attorney review before launch.
  `## 4. Refunds

Fan Engage Pro LLC does not offer refunds for partial billing periods. If you believe you were charged in error, contact [raymond@jonasgroup.com](mailto:raymond@jonasgroup.com) within 30 days of the charge and we will investigate. A promotion or special does not create a refund right.

`,
  // LEGAL-REVIEW: Billing. Specials and trials can carry their own terms, which apply to that offer. The exact wording needs attorney review before launch.
  `## 5. Specials and trials

Specials and trials can carry their own terms. Those terms apply to that offer.

`,
  // LEGAL-REVIEW: Founding Fan. The live FEP section "3. Founding Fan pricing" (lifetime founder rate, and the founder slot not held for returning fans) was removed. No replacement section or badge term was added. Disputes and the changes clause were renumbered and were not rewritten.
  // LEGAL-REVIEW: Chargeback. The chargeback and account-suspension sentence is carried from FEP and was not rewritten.
  `## 6. Disputes

Before initiating a chargeback with your card issuer, please contact [raymond@jonasgroup.com](mailto:raymond@jonasgroup.com) so we can resolve the issue directly. Chargebacks without prior contact may result in account suspension.

`,
  `## 7. Changes to this policy

We may update this policy from time to time. The effective date at the top of this page reflects the most recent revision.
`,
].join("");
