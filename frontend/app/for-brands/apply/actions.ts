"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBrandApplication } from "@/lib/brand-application";
import { verifyApplyTurnstile } from "@/lib/brand-apply-turnstile";
import { brandApplyRateLimiter, getClientIp } from "@/lib/rate-limit";

const APPLY_PATH = "/for-brands/apply";

/**
 * Submit a brand application to public.applications.
 *
 * Public form, no auth. Uses the admin client so the insert lands even when
 * the visitor is not signed in. Because anyone can post here directly, the
 * server enforces its own limits:
 *   1. per-IP rate limit (5 per hour, shared across instances)
 *   2. optional Turnstile check, only when both keys are configured
 *   3. field validation and length limits (lib/brand-application.ts)
 */
export async function submitBrandApplicationAction(
  formData: FormData,
): Promise<void> {
  const ip = getClientIp(await headers());

  if (!(await brandApplyRateLimiter.check(`brand-apply:${ip}`)).success) {
    redirect(`${APPLY_PATH}?error=rate-limited`);
  }

  const token = formData.get("cf-turnstile-response");
  const humanOk = await verifyApplyTurnstile({
    env: {
      siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      secretKey: process.env.TURNSTILE_SECRET_KEY,
    },
    token: typeof token === "string" ? token : null,
    ip,
  });
  if (!humanOk) {
    redirect(`${APPLY_PATH}?error=verification-failed`);
  }

  const parsed = parseBrandApplication(formData);
  if (!parsed.ok) {
    redirect(`${APPLY_PATH}?error=${parsed.error}`);
  }

  const admin = createAdminClient();
  const { error } = await admin.from("applications").insert(parsed.row);

  if (error) {
    console.error("submitBrandApplicationAction error:", error);
    redirect(`${APPLY_PATH}?error=submit-failed`);
  }

  redirect(`${APPLY_PATH}/thanks`);
}
