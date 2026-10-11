/**
 * Brand Engage Pro is paid for by brands. Guests join free.
 *
 * The per-member $10/mo Premium club is closed to new sign-ups. The code
 * stays in place so existing data and the Stripe webhook keep working, but
 * /premium redirects away and checkout refuses to start while this is false.
 */
export const PREMIUM_SALES_OPEN = false;

/** Where to send someone who lands on a closed Premium page. */
export function premiumClosedRedirect(communityId?: string | null): string {
  return communityId ? `/brands/${encodeURIComponent(communityId)}` : "/brands";
}
