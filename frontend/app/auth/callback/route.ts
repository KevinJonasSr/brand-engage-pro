import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isForgotPasswordEnabled } from "@/lib/auth-flags";
import {
  SIGNED_OUT_COOKIE,
  clearSignedOutCookie,
  isSignedOutMarkerValue,
  stampSignedOutCookie,
} from "@/lib/auth-cookies";
import {
  authCallbackErrorPath,
  authCallbackIncompleteMessage,
  authCallbackUserMessage,
  isResetPasswordNext,
  parseAuthCallbackSearch,
} from "@/lib/password-reset";

/**
 * Handles:
 *   - magic-link and signup confirmations (?code=...)
 *   - password recovery (?code=... or ?token_hash=...&type=recovery)
 *
 * Recovery links land on /reset-password. `next` stays a same-origin path.
 * While the forgot-password door is off, recovery errors go to /login.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const parsed = parseAuthCallbackSearch(url.searchParams);
  const forgotPasswordEnabled = isForgotPasswordEnabled();
  const recovery = isResetPasswordNext(parsed.next) || parsed.type === "recovery";

  const fail = (message: string) =>
    NextResponse.redirect(
      `${url.origin}${authCallbackErrorPath({
        message,
        next: parsed.next,
        forgotPasswordEnabled,
      })}`,
    );

  if (parsed.providerError && !parsed.code && !parsed.tokenHash) {
    return fail(
      recovery ? authCallbackUserMessage(parsed.next) : parsed.providerError,
    );
  }

  if (recovery && !parsed.code && !parsed.tokenHash) {
    return fail(authCallbackIncompleteMessage(parsed.next));
  }

  const cookieStore = await cookies();
  const wasSignedOut = isSignedOutMarkerValue(cookieStore.get(SIGNED_OUT_COOKIE)?.value);
  // createClient refuses to write sb-* while this marker is set. Clear it
  // for the recovery exchange, then put it back on the response if that fails.
  if (recovery && wasSignedOut) {
    cookieStore.set(SIGNED_OUT_COOKIE, "", { path: "/", maxAge: 0 });
  }

  let exchangeError: string | null = null;
  if (parsed.tokenHash && parsed.type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: parsed.tokenHash,
      type: parsed.type,
    });
    if (error) {
      exchangeError = recovery ? authCallbackUserMessage(parsed.next) : error.message;
    }
  } else if (parsed.code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
    if (error) {
      exchangeError = recovery ? authCallbackUserMessage(parsed.next) : error.message;
    }
  }

  const response = exchangeError
    ? fail(exchangeError)
    : NextResponse.redirect(`${url.origin}${parsed.next}`);
  if (recovery && wasSignedOut) {
    if (exchangeError) stampSignedOutCookie(response, url.hostname);
    else clearSignedOutCookie(response, url.hostname);
  }
  return response;
}
