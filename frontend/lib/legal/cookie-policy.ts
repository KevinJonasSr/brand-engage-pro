/**
 * Cookie Policy for Brand Engage Pro.
 *
 * Source: the live Fan Engage Pro page https://www.fanengagepro.com/cookie-policy
 * as published on 2026-09-30. The FEP repository does not store this legal text.
 * Product names were adapted for Brand Engage Pro. Review notes are code comments,
 * not page text.
 *
 * // LEGAL-REVIEW: Dates are carried from FEP (effective September 18, 2026;
 * // last updated September 15, 2026). The effective date is later than the
 * // last-updated date. Counsel should set the BEP dates.
 * // LEGAL-REVIEW: Section "1. What are cookies?" has no definition on the
 * // live FEP page. None was added.
 */
export const COOKIE_POLICY_MD = [
  `# Brand Engage Pro Cookie Policy

Effective date: September 18, 2026

Last updated: September 15, 2026

`,
  // LEGAL-REVIEW: Contracting party. Live FEP cookie policy names "Fan Engage Pro LLC" and the short name "Fan Engage." This draft uses Brand Engage Pro ("BEP"), matching the published BEP privacy policy, and does not add an LLC.
  `Brand Engage Pro (“BEP,” “we,” “us,” or “our”) operates the Brand Engage Pro website and related services (the “Service”), including brandengagepro.com and related domains.

This Cookie Policy explains how we use cookies and similar technologies. It should be read with our [Privacy Policy](/privacy) and [Terms of Use](/terms).

1. What are cookies?

`,
  // LEGAL-REVIEW: Cookie inventory. This section is the FEP text, not a new inventory. BEP code actually sets: Supabase auth cookies sb-<project>-auth-token (and chunked .0/.1 plus the code-verifier cookie); bep_signed_out (30 minutes); bep_onboarded (1 year); fe_admin_community (httpOnly, path /admin, 30 days, admin brand switcher); memberengage_ref (referral, 30 days, only after Accept). Consent is localStorage key memberengage_cookie_consent, not a cookie. The frontend has no Google Analytics, gtag, PostHog, or Vercel Analytics package. BEP privacy says the site does not currently use advertising cookies or third-party analytics trackers. The "if/when analytics cookies are enabled" sentence is carried from FEP and must not be read as saying those cookies are on.
  `2. How we use cookies We use cookies to:

Keep you signed in and secure your session Remember basic preferences and platform features Understand invite/referral attribution after you accept our cookie banner (so we can credit an inviter) Protect the Service (for example, abuse and bot prevention where enabled) Measure and improve performance of the Service (if/when analytics cookies are enabled) We do not sell your personal information. We do not use cookies to sell your data to unrelated third parties.

3. Types of cookies we use Strictly necessary / essential

Required for the Service to work — sign-in, security, load balancing, and core features. These generally cannot be turned off in our product without breaking the Service. You can still block them in your browser, which may limit functionality.

Functional / preference

Remember choices such as cookie-consent acknowledgment (we currently store consent in browser local storage after you tap Accept).

Referral / attribution

If you arrive via an invite or referral link, after you accept the cookie banner we may set a referral cookie (or similar) so we can credit your inviter.

Analytics / performance (if used)

Help us understand how the Service is used (pages visited, errors, performance). We will only enable these where disclosed and, where required, with appropriate consent.

Marketing / advertising (if used)

Not a current focus of the public member experience. If we introduce them later, we will update this policy and obtain consent where required.

`,
  // LEGAL-REVIEW: Banner behavior. FEP says the banner is hidden on sign-up and login. BEP shows an Accept-only banner (no Decline) and anchors it at the top on /signup, /login, and /onboarding. Referral cookie memberengage_ref is set only after Accept. This paragraph is carried from FEP and does not describe that BEP behavior.
  `4. Cookie consent On many pages we show a banner describing essential cookies and referral cookies. Choosing Accept records your consent (currently in local storage) and allows referral attribution cookies to be set when applicable. The banner is hidden on some form-heavy routes (for example sign-up and login) so it does not block primary actions; essential cookies for those flows may still be required for the Service to function.

Where law requires consent for non-essential cookies, we will not set those cookies until you consent (or as otherwise permitted by law).

`,
  // LEGAL-REVIEW: Do Not Track. This sentence is carried from FEP ("where we honor them as described in our Privacy Policy"). The published BEP privacy policy says the website does not respond to Do Not Track signals.
  `5. Your choices You can:

Use the cookie banner controls we provide Change or clear cookies and site data in your browser settings Use browser “Do Not Track” or similar signals — where we honor them as described in our Privacy Policy Blocking essential cookies may prevent sign-in or other core features from working.

`,
  // LEGAL-REVIEW: Third parties. Stripe, Supabase, Cloudflare Turnstile, and Mailchimp are named because FEP names them. BEP uses Supabase for auth cookies, loads the Turnstile widget on sign-up and login, and calls Stripe and Mailchimp from the server. This draft does not add a claim about which of those set browser cookies beyond the FEP sentence.
  `6. Third-party cookies Some features may be delivered by service providers (for example hosting, authentication, payments, security/CAPTCHA, email). Those providers may set their own cookies or process data under their policies. Review their documentation where applicable (including Stripe, Supabase, Cloudflare Turnstile, and Mailchimp if used for your experience).

7. Retention Cookies and similar storage last for different periods:

Session — deleted when you close the browser Persistent — remain until they expire or you delete them Local storage consent — until you clear site data or we change the consent mechanism Exact lifetimes vary by cookie and provider.

8. Updates We may update this Cookie Policy from time to time. The “Last updated” date will change when we do. Material changes may also be noted in the Service or by other reasonable means.

9. Contact Questions about cookies or this policy:

Email: [raymond@jonasgroup.com](mailto:raymond@jonasgroup.com)

`,
  // LEGAL-REVIEW: Entity line. FEP says "Fan Engage Pro LLC." This draft says Brand Engage Pro, matching the privacy policy. Counsel must confirm the legal entity name.
  `Entity: Brand Engage Pro
`,
].join("");
