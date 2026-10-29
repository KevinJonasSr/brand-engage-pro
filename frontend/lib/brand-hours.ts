/**
 * Pure helpers for brands.hours_json (migration 0024).
 *
 * Shape: {"mon":[{"open":"11:00","close":"22:00"}], "tue":[...], ...}
 * Keys are three-letter lowercase weekday abbreviations; each day holds
 * zero or more ranges in 24h "HH:MM". A range whose close is at or before
 * its open (e.g. 17:00–02:00) runs past midnight into the next day.
 *
 * No I/O, no Next imports — safe for Node tests and client components.
 */

export type HoursRange = { open: string; close: string };
export type HoursJson = Partial<Record<DayKey, HoursRange[] | null>>;

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const BRAND_HOURS_TIME_ZONE = "America/New_York";

export type TodayHours =
  /** Today has hours. `openNow` says whether `at` falls inside one. */
  | { status: "open"; label: string; ranges: HoursRange[]; openNow: boolean }
  /** Hours exist on other days but not today. `openNow` is true only while
   *  yesterday's overnight range is still running. */
  | { status: "closed"; label: "Closed today"; ranges: []; openNow: boolean }
  /** No usable hours at all — render nothing. */
  | { status: "unknown"; label: null; ranges: []; openNow: false };

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

function toMinutes(hhmm: string): number | null {
  const m = TIME_RE.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 24 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** "11:00" → "11:00", "9:30" → "09:30". Keeps the 24h form the DB stores. */
function formatTime(hhmm: string): string {
  const mins = toMinutes(hhmm);
  if (mins === null) return hhmm;
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function isRange(value: unknown): value is HoursRange {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as HoursRange).open === "string" &&
    typeof (value as HoursRange).close === "string" &&
    toMinutes((value as HoursRange).open) !== null &&
    toMinutes((value as HoursRange).close) !== null
  );
}

/** Returns the well-formed ranges for a day, or [] when missing/invalid. */
export function rangesForDay(hours: unknown, day: DayKey): HoursRange[] {
  if (!hours || typeof hours !== "object") return [];
  const raw = (hours as Record<string, unknown>)[day];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRange);
}

/** True when hours_json has at least one well-formed range on any day. */
export function hasAnyHours(hours: unknown): boolean {
  return DAY_KEYS.some((d) => rangesForDay(hours, d).length > 0);
}

/** Weekday key + minutes-since-midnight for `at` in the given time zone. */
export function localDayAndMinutes(
  at: Date,
  timeZone: string = BRAND_HOURS_TIME_ZONE,
): { day: DayKey; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = get("weekday").slice(0, 3).toLowerCase() as DayKey;
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return { day: DAY_KEYS.includes(day) ? day : "sun", minutes: hour * 60 + minute };
}

function previousDay(day: DayKey): DayKey {
  return DAY_KEYS[(DAY_KEYS.indexOf(day) + 6) % 7];
}

/** True when `minutes` falls inside the range (overnight-aware). */
function inRange(range: HoursRange, minutes: number, spilloverFromPrevDay: boolean): boolean {
  const open = toMinutes(range.open)!;
  const close = toMinutes(range.close)!;
  const overnight = close <= open;
  if (spilloverFromPrevDay) {
    // Yesterday's overnight range covers [00:00, close) today.
    return overnight && minutes < close;
  }
  if (overnight) return minutes >= open;
  return minutes >= open && minutes < close;
}

/**
 * Today's status for display on the brand page. Rules:
 * - No usable hours anywhere (null, {}, all-empty days, malformed) →
 *   status "unknown" with a null label; the caller renders nothing.
 * - Hours exist but today has no range → "Closed today".
 * - Today has ranges → "Open today 11:00–22:00" (multiple ranges joined
 *   with " · "). Times are echoed in the 24h form the DB stores.
 * - `openNow` is true when `at` falls inside a range for today, or inside
 *   yesterday's range that runs past midnight (close <= open).
 *
 * "Today" is evaluated in America/New_York regardless of server zone.
 */
export function describeTodayHours(
  hours: unknown,
  at: Date = new Date(),
  timeZone: string = BRAND_HOURS_TIME_ZONE,
): TodayHours {
  if (!hasAnyHours(hours)) {
    return { status: "unknown", label: null, ranges: [], openNow: false };
  }
  const { day, minutes } = localDayAndMinutes(at, timeZone);
  const today = rangesForDay(hours, day);
  const yesterday = rangesForDay(hours, previousDay(day));

  const openNow =
    today.some((r) => inRange(r, minutes, false)) ||
    yesterday.some((r) => inRange(r, minutes, true));

  if (today.length > 0) {
    const spans = today
      .map((r) => `${formatTime(r.open)}–${formatTime(r.close)}`)
      .join(" · ");
    return { status: "open", label: `Open today ${spans}`, ranges: today, openNow };
  }
  return { status: "closed", label: "Closed today", ranges: [], openNow };
}

/** Google Maps search link for a free-text address. */
export function googleMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

/** tel: href from a display phone number (keeps digits and leading +). */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");
  const normalized = digits.startsWith("+")
    ? "+" + digits.slice(1).replace(/\+/g, "")
    : digits.replace(/\+/g, "");
  return `tel:${normalized}`;
}
