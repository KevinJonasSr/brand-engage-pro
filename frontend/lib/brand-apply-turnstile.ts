/**
 * Optional Turnstile check for the public brand application form.
 *
 * This is a no-op until BOTH keys are set in the environment:
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY (renders the widget)
 *   TURNSTILE_SECRET_KEY           (verifies the token on the server)
 * With only one key set, the form keeps working without a challenge, so a
 * half-finished Vercel setup can never lock brands out of applying.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;

export type TurnstileEnv = {
  siteKey?: string;
  secretKey?: string;
};

export function isApplyTurnstileEnabled(env: TurnstileEnv): boolean {
  return Boolean(env.siteKey && env.secretKey);
}

/**
 * Returns true when the request may proceed. When Turnstile is enabled, a
 * missing, oversized or rejected token, or a Cloudflare error, fails closed.
 */
export async function verifyApplyTurnstile(opts: {
  env: TurnstileEnv;
  token: string | null;
  ip?: string;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  if (!isApplyTurnstileEnabled(opts.env)) return true;
  const token = opts.token?.trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) return false;

  const body = new URLSearchParams();
  body.set("secret", opts.env.secretKey as string);
  body.set("response", token);
  if (opts.ip && opts.ip !== "unknown") body.set("remoteip", opts.ip);

  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!res.ok) {
      console.error("[brand-apply] Turnstile upstream error", res.status);
      return false;
    }
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("[brand-apply] Turnstile verification failed", err);
    return false;
  }
}
