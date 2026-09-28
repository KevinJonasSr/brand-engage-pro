/**
 * Birthday month for the Nellie's birthday entrée (members.birthday_month,
 * 1-12, added in 0052/0058). Onboarding and /me/birthday both write it.
 */

export const BIRTHDAY_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * undefined = not sent or invalid (leave the column alone),
 * null = explicitly cleared, 1-12 = the month.
 */
export function parseBirthdayMonth(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(n) || n < 1 || n > 12) return undefined;
  return n;
}

export function birthdayMonthLabel(month: number | null | undefined): string | null {
  if (typeof month !== "number" || month < 1 || month > 12) return null;
  return BIRTHDAY_MONTHS[month - 1];
}

export type BirthdayMonthSaveResult =
  | { ok: true; month: number }
  | { ok: false; error: string };

export const BIRTHDAY_MONTH_LOCKED_ERROR =
  "Your birthday month is already set. Contact us if it needs to change.";

/**
 * Decide whether a settings save may go ahead. The month can be set once.
 * The redeem RPC allows one entrée per calendar year, but a freely editable
 * month would let anyone redeem in whatever month they like, so changes after
 * the first save go through support.
 */
export function planBirthdayMonthSave(
  current: number | null | undefined,
  raw: unknown,
): BirthdayMonthSaveResult {
  if (birthdayMonthLabel(current)) {
    return { ok: false, error: BIRTHDAY_MONTH_LOCKED_ERROR };
  }
  const month = parseBirthdayMonth(raw);
  if (typeof month !== "number") {
    return { ok: false, error: "Pick your birthday month." };
  }
  return { ok: true, month };
}
