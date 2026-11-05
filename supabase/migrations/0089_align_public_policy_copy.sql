-- 0089_align_public_policy_copy.sql
--
-- NOT applied by this change. Kevin runs it after merge. Do not apply it
-- to production from the app or from CI.
--
-- Public /terms, /privacy, /cancellation-refund, and /cookie-policy render
-- the repo copy while the policy_pages row is missing, still a draft, or
-- still the placeholder. A published non-placeholder row wins. Privacy rows
-- last saved before 2026-10-18 already yield to the repo copy
-- (PRIVACY_REPLACES_DB_UPDATED_BEFORE). This migration only rewrites rows
-- that already contain the old public phrases, so draft placeholders from
-- 0009 and 0020 are left alone.
--
-- Privacy rows older than 2026-10-18 are not updated. policy_pages has an
-- updated_at trigger, and touching those rows would make the pre-scrub
-- database text win over the repo copy.
--
-- No new table. Existing grants on public.policy_pages stay as they are.

update public.policy_pages
set content_md = replace(
  replace(
    content_md,
    'monthly subscription of up to $100 per month',
    'monthly subscription of $50 per month'
  ),
  'raymond@jonasgroup.com',
  'support@brandengagepro.com'
)
where slug in ('terms', 'cancellation_refund', 'cookie_policy')
  and (
    content_md like '%monthly subscription of up to $100 per month%'
    or content_md like '%raymond@jonasgroup.com%'
  );

update public.policy_pages
set content_md = replace(
  replace(
    replace(
      content_md,
      '## Children Under the Age of 13',
      '## Age requirement'
    ),
    $age_old$Our Website is not intended for children under 13 years of age. No one under age 13 may provide any information to or on the Website. We do not knowingly collect Personal Information from children under 13. If you are under 13, do not use or provide any information on this Website or on or through any of its features, register on the Website, make any purchases through the Website, or provide any information about yourself to us, including your name, address, telephone number, e-mail address or any screen name or user name you may use. If we learn we have collected or received Personal Information from a child under 13 without verification of parental consent, we will delete that information. If you believe we might have any information from or about a child under 13, please contact us (please see the "Contact Us" section below).$age_old$,
    $age_new$Our Website is intended for people 18 and older. No one under age 18 may provide any information to or on the Website. We do not knowingly collect Personal Information from anyone under 18. If you are under 18, do not use or provide any information on this Website or on or through any of its features, register on the Website, make any purchases through the Website, or provide any information about yourself to us, including your name, address, telephone number, e-mail address or any screen name or user name you may use. If we learn we have collected or received Personal Information from someone under 18, we will delete that information. If you believe we might have any information from or about someone under 18, please contact us (please see the "Contact Us" section below).$age_new$
  ),
  'raymond@jonasgroup.com',
  'support@brandengagepro.com'
)
where slug = 'privacy'
  and updated_at >= timestamptz '2026-10-18 00:00:00+00'
  and (
    content_md like '%Children Under the Age of 13%'
    or content_md like '%children under 13%'
    or content_md like '%raymond@jonasgroup.com%'
  );
