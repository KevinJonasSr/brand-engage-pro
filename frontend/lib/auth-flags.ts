type EnvLike = Record<string, string | undefined>;

function isExplicitlyTrue(value: string | undefined): boolean {
  return value === "true";
}

function isVercelProduction(env: EnvLike): boolean {
  return (
    env.VERCEL_ENV === "production" ||
    env.NEXT_PUBLIC_VERCEL_ENV === "production"
  );
}

/**
 * Magic-link door. Off when VERCEL_ENV / NEXT_PUBLIC_VERCEL_ENV is
 * production unless NEXT_PUBLIC_MAGIC_LINK_ENABLED is explicitly true.
 * Do not set that flag in production.
 */
export function isMagicLinkEnabled(env: EnvLike = process.env): boolean {
  if (isExplicitlyTrue(env.NEXT_PUBLIC_MAGIC_LINK_ENABLED)) return true;
  return !isVercelProduction(env);
}

/**
 * Forgot-password link on /login. Off when VERCEL_ENV /
 * NEXT_PUBLIC_VERCEL_ENV is production unless
 * NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED is explicitly true.
 * /forgot-password may stay reachable by URL; do not link it from /login
 * in production. Do not set that flag in production.
 */
export function isForgotPasswordEnabled(env: EnvLike = process.env): boolean {
  if (isExplicitlyTrue(env.NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED)) return true;
  return !isVercelProduction(env);
}
