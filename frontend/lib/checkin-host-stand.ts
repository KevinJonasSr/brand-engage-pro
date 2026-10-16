import { canAccessBrand, getAdminContext } from "@/lib/admin";
import { readBrandBilling } from "@/lib/brand-billing-server";
import {
  hostStandDisplayDecision,
  stripeBrandBillingConfigured,
} from "@/lib/brand-billing";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin gate for the host-stand screen. Brand-scoped, and closed when that
 * brand's billing lock is on. Super-admins stay allowed so the tablet can
 * be set up. A failed billing lookup does not serve a code when Stripe is
 * configured.
 */
export async function hostStandBrandAccess(brandSlug: string): Promise<
  | { ok: true; brand: string }
  | { ok: false; status: 401 | 403 | 503; message: string }
> {
  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, status: 401, message: "Unauthorized" };
  if (!canAccessBrand(ctx, brandSlug)) {
    return {
      ok: false,
      status: 403,
      message: "You can only open the host stand for a brand you manage.",
    };
  }

  let lookupFailed = false;
  let row: Awaited<ReturnType<typeof readBrandBilling>> = null;
  try {
    row = await readBrandBilling(createAdminClient(), brandSlug);
  } catch {
    lookupFailed = true;
    console.warn("host stand: billing lookup failed");
  }

  const decision = hostStandDisplayDecision({
    isSuperAdmin: ctx.isSuperAdmin,
    lookupFailed,
    stripeConfigured: stripeBrandBillingConfigured(),
    row,
  });
  if (!decision.allow) {
    return { ok: false, status: decision.status, message: decision.message };
  }
  return { ok: true, brand: brandSlug.trim() };
}
