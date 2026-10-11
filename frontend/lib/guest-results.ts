/**
 * Homepage "results" numbers (item 17). Pure module, no imports, so it can
 * be unit tested and read from the page and the data fetcher.
 *
 * Counts real guests only: team (jonasgroup.com) and test (example.com)
 * accounts are left out. The section stays hidden until Nellie's has at
 * least RESULTS_MIN_VISITS real visits and RESULTS_MIN_REPEAT_GUESTS repeat
 * guests, so the homepage never shows thin or made-up numbers.
 *
 * As of 2026-10-11 Nellie's has 0 real visits, so the section is hidden.
 */

export const RESULTS_BRAND_SLUG = "nellies";
export const RESULTS_MIN_VISITS = 50;
export const RESULTS_MIN_REPEAT_GUESTS = 10;
export const EXCLUDED_EMAIL_DOMAINS = ["jonasgroup.com", "example.com"] as const;

const RECENT_DAYS = 30;
const DAY_MS = 86_400_000;

export type GuestVisitRow = {
  member_id: string;
  email: string | null;
  created_at: string;
};

export type GuestResults = {
  visits: number;
  guests: number;
  repeatGuests: number;
  /** repeatGuests / guests, 0 to 1. */
  repeatRate: number;
  visits30d: number;
};

export function isRealGuestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return !EXCLUDED_EMAIL_DOMAINS.some((d) => domain === d);
}

export function summarizeGuestResults(
  rows: readonly GuestVisitRow[],
  now: Date = new Date(),
): GuestResults {
  const real = rows.filter((r) => isRealGuestEmail(r.email));
  const cutoff = now.getTime() - RECENT_DAYS * DAY_MS;

  const visitsByGuest = real.reduce<ReadonlyMap<string, number>>(
    (acc, r) => new Map(acc).set(r.member_id, (acc.get(r.member_id) ?? 0) + 1),
    new Map(),
  );
  const guests = visitsByGuest.size;
  const repeatGuests = [...visitsByGuest.values()].filter((n) => n >= 2).length;

  return {
    visits: real.length,
    guests,
    repeatGuests,
    repeatRate: guests === 0 ? 0 : repeatGuests / guests,
    visits30d: real.filter((r) => Date.parse(r.created_at) >= cutoff).length,
  };
}

export function shouldShowGuestResults(results: GuestResults | null): boolean {
  return (
    results !== null &&
    results.visits >= RESULTS_MIN_VISITS &&
    results.repeatGuests >= RESULTS_MIN_REPEAT_GUESTS
  );
}
