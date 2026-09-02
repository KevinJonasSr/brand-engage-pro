# Turnstile on www.brandengagepro.com

Signup (`/signup`) mounts Cloudflare Turnstile as **Security check**. If the
widget cannot load, Create account stays grey until the check succeeds **or**
the widget reports failure (then Retry + fail-open).

Magic-link and forgot-password doors stay **HOLD** in production. Do not set
`NEXT_PUBLIC_MAGIC_LINK_ENABLED` or `NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED`.

This is the same widget pattern as Fan Engage Pro, but **BEP must use its own
Turnstile site key**. Do not paste FE’s key onto BEP.

## Production env (Vercel)

Project: `brand-engage-pro` → **Settings → Environment Variables → Production**.

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | **Yes** | Public widget key. Must match the BEP widget, not Fan Engage. Changing this requires a **redeploy** (it is inlined at build). |
| `TURNSTILE_SECRET_KEY` | **Yes** | Server verify key for the same widget. Missing in production → `/api/turnstile/verify` 503. |
| `TURNSTILE_ALLOW_BYPASS` | No | Must **not** be `1` on Production. Ignored when `VERCEL_ENV=production` anyway. |

Optional Preview: set the same pair, **or** `TURNSTILE_ALLOW_BYPASS=1` only on
Preview/Development. Preview `*.vercel.app` hosts are not pinned to www.

Canonical origin is `https://www.brandengagepro.com`. Apex
`brandengagepro.com` and `brand-engage-pro.vercel.app` already 308 to www —
do not point Turnstile or `NEXT_PUBLIC_APP_URL` at those as landing hosts.

After changing any `NEXT_PUBLIC_*` value: **Deployments → … → Redeploy**
(or push an empty commit). Env-only saves do not rebuild the client bundle.

## Cloudflare Turnstile host allowlist

Dashboard: [Cloudflare Turnstile](https://dash.cloudflare.com/) → **Turnstile**
→ the **Brand Engage Pro** widget (the one whose site key is
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` on this Vercel project).

**Hostname allowlist** (add every host guests actually hit):

| Hostname | Why |
|---|---|
| `www.brandengagepro.com` | Production signup. Required. |
| `brandengagepro.com` | Apex 308s to www; add so a first-paint on apex cannot fail the widget before redirect. |
| `brand-engage-pro.vercel.app` | Sibling production alias (also 308s to www). Optional but recommended. |
| `localhost` | Local `next dev` only if you test with real keys. |

Do **not** add Fan Engage hosts (`www.fanengagepro.com`, etc.) to the BEP
widget, and do not reuse FE’s site key (`0x4AAAAAAD1JKjkVoSDAz9k8`) here.

Widget mode: **Managed** is fine. Domain matching is hostname-exact; `www` and
apex are different entries.

Save the widget, then hard-refresh `https://www.brandengagepro.com/signup`.
Allowlist edits are live (no Vercel redeploy) once the key was already baked.

## Smoke (www)

1. Open `https://www.brandengagepro.com/signup` signed out.
2. Security check: Cloudflare iframe (not a permanent “couldn't load” card).
3. Completing the check enables **Create account**.
4. If the check fails: **Retry security check** appears; Create account is
   not a dead grey button (fail-open + “You can still create an account.”).
5. Do not send marketing lists. Test accounts only (`+bep-turnstile@…` or
   similar). Magic / forgot stay hidden.

## Sign-out doors

`/logout`, `/signout`, and `/auth/signout` all call Supabase `signOut` and
303 to `/` (GET and POST). The account menu still POSTs `/auth/signout`.
