import { safeRelativePath } from "./safe-redirect.ts";
import { resolveAppUrl } from "./site-url.ts";

/**
 * Password recovery, matching Fan Engage:
 * email link → /auth/callback?next=/reset-password → /reset-password.
 * Production keeps the door closed unless NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED
 * is explicitly true. Do not set that flag in production.
 */

const AUTH_EMAIL_OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const;

export type AuthEmailOtpType = (typeof AUTH_EMAIL_OTP_TYPES)[number];

/** Resend lock. A newer recovery email invalidates the previous link. */
export const RESET_LINK_COOLDOWN_SECONDS = 45;

export const RESET_LINK_SENT_MESSAGE =
  "Check your email for a link to reset your password. Use the newest link — requesting another one invalidates the previous one.";

export function isAuthEmailOtpType(value: string | null | undefined): value is AuthEmailOtpType {
  return typeof value === "string" && (AUTH_EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

export function isResetPasswordNext(next: string): boolean {
  return next === "/reset-password" || next.startsWith("/reset-password?");
}

function trimmed(value: string | null): string | null {
  const next = value?.trim();
  return next ? next : null;
}

export type AuthCallbackSearch = {
  code: string | null;
  tokenHash: string | null;
  type: AuthEmailOtpType | null;
  next: string;
  providerError: string | null;
};

/** Read the Supabase email-link query. An empty next on a recovery link lands on /reset-password. */
export function parseAuthCallbackSearch(params: URLSearchParams): AuthCallbackSearch {
  const typeRaw = trimmed(params.get("type"));
  const type = isAuthEmailOtpType(typeRaw) ? typeRaw : null;
  const nextRaw = params.get("next");
  const next =
    (nextRaw == null || nextRaw.trim() === "") && type === "recovery"
      ? "/reset-password"
      : safeRelativePath(nextRaw, "/");
  return {
    code: trimmed(params.get("code")),
    tokenHash: trimmed(params.get("token_hash")),
    type,
    next,
    providerError: trimmed(params.get("error_description")) ?? trimmed(params.get("error")),
  };
}

export function authCallbackIncompleteMessage(next: string): string {
  return isResetPasswordNext(next)
    ? "This password reset link is incomplete. Request a new one."
    : "This sign-in link is incomplete. Please sign in again.";
}

export function authCallbackUserMessage(next: string): string {
  return isResetPasswordNext(next)
    ? "This password reset link has expired or could not be verified. Request a new one."
    : "This sign-in link has expired or could not be verified. Please sign in again.";
}

/**
 * Recovery errors go back to the request form only while that door is open.
 * While the production flag is off, they land on /login instead.
 */
export function authCallbackErrorPath(opts: {
  message: string;
  next: string;
  forgotPasswordEnabled: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("error", opts.message);
  if (isResetPasswordNext(opts.next) && opts.forgotPasswordEnabled) {
    return `/forgot-password?${params.toString()}`;
  }
  params.set("next", opts.next);
  return `/login?${params.toString()}`;
}

/** Email redirect target. Same shape as Fan Engage's authEmailRedirectTo. */
export function authEmailRedirectTo(
  path: string,
  origin: string = resolveAppUrl(),
): string {
  const next = safeRelativePath(path, "/reset-password");
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export function buildResetPasswordEmailOptions(input: {
  redirectTo: string;
  turnstileConfigured: boolean;
  turnstileToken: string | null;
}): { redirectTo: string; captchaToken?: string } {
  if (!input.turnstileConfigured) return { redirectTo: input.redirectTo };
  const captchaToken = input.turnstileToken?.trim();
  if (!captchaToken) {
    throw new Error("Complete the security check, then try again.");
  }
  return { redirectTo: input.redirectTo, captchaToken };
}

export function resetLinkButtonLabel(opts: {
  cooldown: number;
  status: "idle" | "loading" | "sent" | "error";
  turnstileConfigured: boolean;
  loadState: "loading" | "ready" | "error";
  hasToken: boolean;
}): string {
  if (opts.cooldown > 0) return `Resend reset link in ${opts.cooldown}s`;
  if (opts.status === "loading") return "Sending…";
  if (opts.status === "sent") return "Resend reset link";
  if (opts.turnstileConfigured && opts.loadState === "loading") return "Security check loading…";
  if (opts.turnstileConfigured && !opts.hasToken && opts.loadState !== "error") {
    return "Complete security check, then send link";
  }
  return "Send reset link";
}

/**
 * Recovery callback and the reset page must be allowed to store the new
 * session. The sticky signed-out marker otherwise hides and expires sb-*
 * cookies, so a reset link opened after Sign out could never stick.
 */
export function isPasswordRecoveryEntry(pathname: string, search = ""): boolean {
  if (pathname === "/reset-password") return true;
  if (pathname !== "/auth/callback") return false;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.get("type") === "recovery") return true;
  const next = params.get("next") ?? "";
  return isResetPasswordNext(next);
}
