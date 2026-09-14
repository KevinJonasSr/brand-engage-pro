export const SIGNUP_NOT_CREATED_MESSAGE =
  "Account wasn't created. Complete the security check or tap Retry, then try again.";

export const SIGNUP_CREATE_FAILED_MESSAGE =
  "We couldn’t create your account. Try again in a moment.";

export const SIGNUP_EMAIL_IN_USE_MESSAGE =
  "That email is already in use. Sign in, or try a different email.";

const EMAIL_IN_USE_RE =
  /already registered|already been registered|already exists|email.*(?:in use|taken)|user already/i;

export type SignupUserLike = {
  identities?: Array<unknown> | null;
} | null | undefined;

export function didSignupCreateUser(user: SignupUserLike): boolean {
  if (!user) return false;
  if (Array.isArray(user.identities) && user.identities.length === 0) return false;
  return true;
}

/**
 * Never show raw GoTrue / Postgres text on /signup.
 * Known cases get a specific line; everything else is the generic retry copy.
 * Duplicate-email must not be blamed on Turnstile.
 */
export function sanitizeSignupError(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return SIGNUP_CREATE_FAILED_MESSAGE;
  if (text === SIGNUP_NOT_CREATED_MESSAGE) return SIGNUP_NOT_CREATED_MESSAGE;
  if (text === SIGNUP_CREATE_FAILED_MESSAGE) return SIGNUP_CREATE_FAILED_MESSAGE;
  if (text === SIGNUP_EMAIL_IN_USE_MESSAGE) return SIGNUP_EMAIL_IN_USE_MESSAGE;
  if (EMAIL_IN_USE_RE.test(text)) return SIGNUP_EMAIL_IN_USE_MESSAGE;
  return SIGNUP_CREATE_FAILED_MESSAGE;
}

export type SignupCreateInput = {
  signUpError: string | null;
  user: SignupUserLike;
  session: unknown | null;
  signInError: string | null;
  signInSession: unknown | null;
};

export type SignupCreateDecision = {
  action: "proceed" | "stay-error";
  message: string;
};

/**
 * Password signup must not send a member to login after a silent non-create.
 * Empty identities is the usual Supabase duplicate-email shape — map that
 * to the friendly in-use line, not Turnstile copy.
 */
export function interpretSignupCreate(opts: SignupCreateInput): SignupCreateDecision {
  if (opts.signUpError) {
    return { action: "stay-error", message: sanitizeSignupError(opts.signUpError) };
  }
  if (!didSignupCreateUser(opts.user)) {
    return { action: "stay-error", message: SIGNUP_EMAIL_IN_USE_MESSAGE };
  }
  if (opts.session || opts.signInSession) {
    return { action: "proceed", message: "" };
  }
  return { action: "stay-error", message: SIGNUP_NOT_CREATED_MESSAGE };
}
