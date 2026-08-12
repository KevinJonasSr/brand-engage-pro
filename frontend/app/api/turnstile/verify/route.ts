import { NextResponse, type NextRequest } from "next/server";
import { authRateLimiter, getClientIp } from "@/lib/rate-limit";
import { isProductionRuntime, isTurnstileBypassAllowed } from "@/lib/turnstile";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = authRateLimiter.check(ip ?? "unknown");
  if (!rl.success) {
    return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (isTurnstileBypassAllowed()) {
      console.warn(
        "[turnstile] TURNSTILE_SECRET_KEY unset; allowing request because TURNSTILE_ALLOW_BYPASS=1",
      );
      return NextResponse.json({ success: true, bypass: true });
    }

    if (isProductionRuntime()) {
      console.error(
        "[turnstile] TURNSTILE_SECRET_KEY is not configured — refusing captcha verification",
      );
      return NextResponse.json(
        {
          success: false,
          error: "turnstile_not_configured",
          message: "Security check is temporarily unavailable. Please try again later.",
        },
        { status: 503 },
      );
    }

    // Local `next dev` (and non-production runtimes) without keys: allow so
    // engineers can sign in. Production never reaches this branch.
    console.warn(
      "[turnstile] TURNSTILE_SECRET_KEY unset in non-production; allowing request. " +
        "Set TURNSTILE_SECRET_KEY + NEXT_PUBLIC_TURNSTILE_SITE_KEY for real verification, " +
        "or TURNSTILE_ALLOW_BYPASS=1 on preview/local production builds.",
    );
    return NextResponse.json({ success: true, bypass: true });
  }

  let token: string | undefined;
  try {
    const body = await request.json();
    token = typeof body.token === "string" ? body.token : undefined;
  } catch {
    return NextResponse.json({ success: false, error: "invalid_body" }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ success: false, error: "missing_token" }, { status: 400 });
  }

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);

  const res = await fetch(VERIFY_URL, {
    method: "POST",
    body: form,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!res.ok) {
    return NextResponse.json({ success: false, error: "upstream_error" }, { status: 502 });
  }

  const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };

  if (!data.success) {
    return NextResponse.json(
      { success: false, error: data["error-codes"]?.[0] ?? "challenge_failed" },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
