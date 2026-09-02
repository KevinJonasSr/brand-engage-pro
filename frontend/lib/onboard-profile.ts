/**
 * Shared onboarding profile payload helpers.
 *
 * The wizard's Continue path sends a draft (name/interests) so those fields
 * persist before the last-step TOS gate. Finish sends consent and completes.
 */

export type OnboardProfilePayload = {
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  phone?: string | null;
  handle?: string | null;
  favoriteBrand?: string | null;
  interest?: string | null;
  referralCode?: string;
  smsOptedIn?: boolean;
  emailOptedIn?: boolean;
  consentAcceptedAt?: string;
  consentVersion?: string;
  birthdayMonth?: number | string | null;
  /** True when Continue saves profile fields without completing onboarding. */
  draft?: boolean;
};

export function isOnboardDraft(payload: {
  draft?: boolean;
}): boolean {
  return payload.draft === true;
}

function trimOrNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Columns the member (or service role) may write for onboarding.
 * Consent / opt-in flags are only stamped on a real Finish, never a draft.
 */
export function buildMemberProfileUpdates(
  payload: OnboardProfilePayload,
  existingSocials?: Record<string, unknown> | null,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  const firstName = trimOrNull(payload.firstName);
  if (firstName !== undefined) updates.first_name = firstName;

  const lastName = trimOrNull(payload.lastName);
  if (lastName !== undefined) updates.last_name = lastName;

  const city = trimOrNull(payload.city);
  if (city !== undefined) updates.city = city;

  const phone = trimOrNull(payload.phone);
  if (phone !== undefined) updates.phone = phone;

  const favoriteBrand = trimOrNull(payload.favoriteBrand);
  if (favoriteBrand !== undefined) updates.favorite_brand = favoriteBrand;

  const interest = trimOrNull(payload.interest);
  if (interest !== undefined) updates.interest = interest;

  const handle = trimOrNull(payload.handle);
  if (handle !== undefined) {
    updates.socials = {
      ...(existingSocials ?? {}),
      instagram_or_tiktok: handle,
    };
  }

  if (!isOnboardDraft(payload)) {
    updates.sms_opted_in = Boolean(payload.smsOptedIn);
    updates.email_opted_in = Boolean(payload.emailOptedIn);
    if (payload.consentAcceptedAt) {
      updates.consent_accepted_at = payload.consentAcceptedAt;
    }
    if (payload.consentVersion !== undefined) {
      updates.consent_version = payload.consentVersion ?? null;
    }
  }

  return updates;
}
