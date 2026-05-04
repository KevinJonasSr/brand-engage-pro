/**
 * VAPID key loader.
 *
 * Web Push requires VAPID-signed requests. The keys are generated ONCE
 * (see `node scripts/generate-vapid.mjs` or `npx web-push generate-vapid-keys`)
 * and stored as Vercel env vars:
 *
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  → exposed to the browser for subscribe()
 *   VAPID_PRIVATE_KEY             → server-only, used to sign push requests
 *   VAPID_SUBJECT                 → mailto: or https: URL identifying the sender
 *                                    (e.g., mailto:kevinjonassr@gmail.com)
 *
 * If the keys are missing, `loadVapid()` returns null and push sends become
 * no-ops — the rest of the system (SMS, in-app log) still works.
 */

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function loadVapid(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:kevinjonassr@gmail.com";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}
