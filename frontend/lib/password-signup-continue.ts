export const PASSWORD_SIGNUP_BOUNCE =
  "Sign in with the password you just created";

export type PasswordSignupContinue =
  | { ok: true }
  | { ok: false; message: typeof PASSWORD_SIGNUP_BOUNCE };

/**
 * Password-first signup continue. Confirm-email is not the member path
 * (PKCE email links fail). If signUp did not return a session, immediately
 * signInWithPassword with the password just set. If that still fails, the
 * only bounce is PASSWORD_SIGNUP_BOUNCE — no check-email / resend panel.
 */
export async function continueAfterPasswordSignup(opts: {
  session: unknown;
  email: string;
  password: string;
  signInWithPassword: (credentials: {
    email: string;
    password: string;
  }) => Promise<{ data?: { session?: unknown } | null; error?: unknown }>;
}): Promise<PasswordSignupContinue> {
  if (opts.session) return { ok: true };

  const { data, error } = await opts.signInWithPassword({
    email: opts.email,
    password: opts.password,
  });
  if (!error && data?.session) return { ok: true };

  return { ok: false, message: PASSWORD_SIGNUP_BOUNCE };
}
